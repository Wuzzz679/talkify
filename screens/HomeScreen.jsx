import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  TextInput,
  ActivityIndicator,
  Image,
  Animated,
  RefreshControl,
  Platform,
  Modal
} from 'react-native';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  getDoc,
  setDoc,
  onSnapshot
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { FAB, Provider as PaperProvider } from 'react-native-paper';

const HomeScreen = ({ navigation }) => {
  const [friends, setFriends] = useState([]);
  const [filteredFriends, setFilteredFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [friendStatuses, setFriendStatuses] = useState({});
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [showFriendMenu, setShowFriendMenu] = useState(false);
  
  // Group chat states
  const [groups, setGroups] = useState([]);
  const [groupUnreadCounts, setGroupUnreadCounts] = useState({});
  const [fabOpen, setFabOpen] = useState(false);
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const searchScale = useRef(new Animated.Value(1)).current;
  const fabAnim = useRef(new Animated.Value(0)).current;

  // Filter friends when search query changes
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredFriends(friends);
    } else {
      const filtered = friends.filter(friend => 
        friend.username?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredFriends(filtered);
    }
  }, [searchQuery, friends]);

  // Real-time listener for unread messages count (private chats)
  useEffect(() => {
    if (!auth.currentUser) return;

    const unreadListeners = friends.map(friend => {
      const chatId = [auth.currentUser.uid, friend.id].sort().join('_');
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const q = query(messagesRef, where('read', '==', false), where('userId', '!=', auth.currentUser.uid));
      
      return onSnapshot(q, (snapshot) => {
        setUnreadCounts(prev => ({
          ...prev,
          [friend.id]: snapshot.size
        }));
      });
    });

    return () => {
      unreadListeners.forEach(unsubscribe => unsubscribe && unsubscribe());
    };
  }, [friends]);

  // Real-time listener for friends' online status
  useEffect(() => {
    if (!auth.currentUser || friends.length === 0) return;

    const unsubscribes = friends.map(friend => {
      const friendRef = doc(db, 'users', friend.id);
      return onSnapshot(friendRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFriendStatuses(prev => ({
            ...prev,
            [friend.id]: {
              online: data.online || false,
              lastSeen: data.lastSeen?.toDate?.() || null
            }
          }));
        }
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub && unsub());
    };
  }, [friends]);

  // Load groups from user document
  const loadGroups = async (groupIds) => {
    if (!groupIds || groupIds.length === 0) {
      setGroups([]);
      return;
    }
    const groupsList = [];
    for (const groupId of groupIds) {
      const groupDoc = await getDoc(doc(db, 'groups', groupId));
      if (groupDoc.exists()) {
        groupsList.push({ id: groupDoc.id, ...groupDoc.data() });
        const messagesRef = collection(db, 'groupMessages', groupId, 'messages');
        const q = query(messagesRef, where('read', '==', false), where('userId', '!=', auth.currentUser.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          setGroupUnreadCounts(prev => ({
            ...prev,
            [groupId]: snapshot.size
          }));
        });
      }
    }
    setGroups(groupsList);
  };

  // Real-time listener for own user document to get groups array
  useEffect(() => {
    if (!auth.currentUser) return;
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const groupIds = docSnap.data().groups || [];
        loadGroups(groupIds);
      }
    });
    return () => unsubscribe();
  }, []);

  // Initial data load and real-time listener for own user document (friends)
  useEffect(() => {
    if (!auth.currentUser) return;

    loadUserData();
    loadFriends();
    
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (docSnap) => {
      if (docSnap.exists() && auth.currentUser) {
        loadFriends();
        loadUserData();
      }
    });
    
    Animated.spring(fabAnim, {
      toValue: 1,
      friction: 5,
      useNativeDriver: true,
    }).start();
    
    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (auth.currentUser) {
        loadFriends();
        loadUserData();
      }
    }, [])
  );

  const loadUserData = async () => {
    if (!auth.currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        setUserData(userDoc.data());
      } else {
        const newUser = {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          username: auth.currentUser.email?.split('@')[0],
          friends: [],
          friendRequests: [],
          sentRequests: [],
          groups: [],
          blocked: [],
          createdAt: new Date(),
        };
        await setDoc(doc(db, 'users', auth.currentUser.uid), newUser);
        setUserData(newUser);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadFriends = async () => {
    if (!auth.currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const friendIds = userDoc.data().friends || [];
        const blockedIds = userDoc.data().blocked || [];
        const friendsList = [];
        for (const friendId of friendIds) {
          // Skip if blocked (shouldn't be in friends but just in case)
          if (blockedIds.includes(friendId)) continue;
          const friendDoc = await getDoc(doc(db, 'users', friendId));
          if (friendDoc.exists()) {
            friendsList.push({ id: friendDoc.id, ...friendDoc.data() });
          }
        }
        setFriends(friendsList);
        setFilteredFriends(friendsList);
      }
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  // Unfriend a user
  const unfriendUser = async (friendId, friendName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Unfriend',
      `Are you sure you want to remove ${friendName} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: async () => {
            try {
              const currentUserRef = doc(db, 'users', auth.currentUser.uid);
              const friendUserRef = doc(db, 'users', friendId);
              
              await updateDoc(currentUserRef, {
                friends: arrayRemove(friendId)
              });
              await updateDoc(friendUserRef, {
                friends: arrayRemove(auth.currentUser.uid)
              });
              
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Success', `Removed ${friendName} from your friends.`);
              setShowFriendMenu(false);
              setSelectedFriend(null);
            } catch (error) {
              console.error('Error unfriending:', error);
              Alert.alert('Error', 'Failed to unfriend. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Block a user (removes from friends and adds to blocked list)
  const blockUser = async (friendId, friendName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Block User',
      `Are you sure you want to block ${friendName}? You will no longer receive messages from them and they will be removed from your friends.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              const currentUserRef = doc(db, 'users', auth.currentUser.uid);
              const friendUserRef = doc(db, 'users', friendId);
              
              await updateDoc(currentUserRef, {
                friends: arrayRemove(friendId),
                blocked: arrayUnion(friendId)
              });
              await updateDoc(friendUserRef, {
                friends: arrayRemove(auth.currentUser.uid)
              });
              
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Blocked', `${friendName} has been blocked.`);
              setShowFriendMenu(false);
              setSelectedFriend(null);
            } catch (error) {
              console.error('Error blocking user:', error);
              Alert.alert('Error', 'Failed to block user. Please try again.');
            }
          }
        }
      ]
    );
  };

  const searchUsersToAdd = async () => {
    if (!auth.currentUser) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (!modalSearchQuery.trim()) {
      Alert.alert('Info', 'Please enter a username to search');
      return;
    }
    
    Animated.sequence([
      Animated.spring(searchScale, { toValue: 0.95, friction: 5, useNativeDriver: true }),
      Animated.spring(searchScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    
    setSearchingUsers(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '>=', modalSearchQuery), where('username', '<=', modalSearchQuery + '\uf8ff'));
      const querySnapshot = await getDocs(q);
      
      const results = [];
      querySnapshot.forEach((doc) => {
        if (doc.id !== auth.currentUser.uid) {
          const isAlreadyFriend = friends.some(friend => friend.id === doc.id);
          results.push({ id: doc.id, ...doc.data(), isAlreadyFriend });
        }
      });
      setSearchResults(results);
      
      if (results.length === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('No Results', `No users found with username "${modalSearchQuery}"`);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error('Error searching users:', error);
      Alert.alert('Error', 'Failed to search users');
    } finally {
      setSearchingUsers(false);
    }
  };

  const sendFriendRequest = async (userId, userUsername) => {
    if (sendingRequest) return;
    if (!auth.currentUser) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingRequest(true);
    
    try {
      const targetUserRef = doc(db, 'users', userId);
      const targetUserDoc = await getDoc(targetUserRef);
      
      if (!targetUserDoc.exists()) {
        Alert.alert('Error', 'User not found');
        return;
      }
      
      await updateDoc(targetUserRef, {
  friendRequests: arrayUnion(auth.currentUser.uid)
});

// Also add to current user's sentRequests array
const currentUserRef = doc(db, 'users', auth.currentUser.uid);
await updateDoc(currentUserRef, {
  sentRequests: arrayUnion(userId)
});
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', `Friend request sent to ${userUsername}!`);
      
      setModalSearchQuery('');
      setSearchResults([]);
      setShowAddModal(false);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error('Error sending friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
    } finally {
      setSendingRequest(false);
    }
  };

  const startChat = (friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Chat', { friend: friend });
  };

  const openGroupChat = (group) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('GroupChat', { group: group });
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: async () => {
            try {
              const user = auth.currentUser;
              if (user) {
                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, { online: false, lastSeen: new Date() });
                console.log('✅ User set offline before logout');
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              await signOut(auth);
              console.log('✅ Signed out successfully');
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          }
        }
      ]
    );
  };

  const onRefresh = async () => {
    if (!auth.currentUser) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await Promise.all([loadFriends(), loadUserData()]);
    setRefreshing(false);
  };

  const openAddFriend = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFabOpen(false);
    setModalSearchQuery('');
    setSearchResults([]);
    setShowAddModal(true);
  };

  const openCreateGroup = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFabOpen(false);
    navigation.navigate('CreateGroup');
  };

  const handleLongPressFriend = (friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFriend(friend);
    setShowFriendMenu(true);
  };

  const SkeletonLoader = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((item) => (
        <View key={item} style={styles.skeletonCard}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonTextContainer}>
            <View style={styles.skeletonName} />
            <View style={styles.skeletonEmail} />
          </View>
        </View>
      ))}
    </View>
  );

  const renderFriend = ({ item }) => {
    const unreadCount = unreadCounts[item.id] || 0;
    const isOnline = friendStatuses[item.id]?.online || false;
    
    return (
      <TouchableOpacity 
        style={styles.friendCard} 
        onPress={() => startChat(item)} 
        onLongPress={() => handleLongPressFriend(item)}
        activeOpacity={0.7}
        delayLongPress={300}
      >
        <View style={styles.avatarContainer}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase()}</Text>
            </View>
          )}
          {isOnline && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.friendInfo}>
          <Text style={styles.friendName}>{item.username}</Text>
          {unreadCount > 0 ? (
            <Text style={styles.newMessageText}>{unreadCount} new message{unreadCount !== 1 ? 's' : ''}</Text>
          ) : isOnline ? (
            <Text style={styles.onlineText}>Online</Text>
          ) : null}
        </View>
        <View style={styles.rightContainer}>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
          <Ionicons name="chatbubble-outline" size={24} color="#4CD964" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroup = ({ item }) => {
    const unreadCount = groupUnreadCounts[item.id] || 0;
    return (
      <TouchableOpacity style={styles.groupCard} onPress={() => openGroupChat(item)} activeOpacity={0.7}>
        <View style={styles.groupAvatar}>
          <Ionicons name="people" size={28} color="#000" />
        </View>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{item.name}</Text>
          <Text style={styles.groupMembers}>{item.members?.length || 0} members</Text>
        </View>
        <View style={styles.rightContainer}>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
          <Ionicons name="chatbubble-outline" size={24} color="#FF9800" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderSearchResult = ({ item }) => (
    <View style={styles.searchResultCard}>
      {item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{item.username}</Text>
        <Text style={styles.friendEmail}>{item.email}</Text>
      </View>
      {item.isAlreadyFriend ? (
        <View style={styles.alreadyFriendButton}>
          <Text style={styles.alreadyFriendText}>Already Friend</Text>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.addButton, sendingRequest && styles.addButtonDisabled]} 
          onPress={() => sendFriendRequest(item.id, item.username)}
          disabled={sendingRequest}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>
            {sendingRequest ? 'Sending...' : 'Add Friend'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <PaperProvider>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>💬 Talkify</Text>
            {userData && (
              <Text style={styles.userGreeting}>Hello, {userData.username}!</Text>
            )}
          </View>
          <View style={styles.headerButtons}>
  <TouchableOpacity onPress={() => navigation.navigate('FriendRequests')} style={styles.headerButton}>
    <Ionicons name="people-outline" size={26} color="#4CD964" />
  </TouchableOpacity>
  <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.headerButton}>
    <Ionicons name="person-circle-outline" size={26} color="#4CD964" />
  </TouchableOpacity>
  <TouchableOpacity onPress={() => navigation.navigate('BlockedUsers')} style={styles.headerButton}>
    <Ionicons name="ban-outline" size={26} color="#FF6B6B" />
  </TouchableOpacity>
  <TouchableOpacity onPress={handleLogout} style={styles.headerButton}>
    <Ionicons name="log-out-outline" size={26} color="#FF6B6B" />
  </TouchableOpacity>
</View>
        </View>

        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search your friends..."
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#888" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <SkeletonLoader />
        ) : (
          <>
            {/* Groups Section */}
            {groups.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Groups ({groups.length})</Text>
                <FlatList
                  data={groups}
                  renderItem={renderGroup}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.list}
                  showsVerticalScrollIndicator={false}
                />
              </>
            )}

            {/* Friends Section */}
            <Text style={styles.sectionTitle}>
              Friends ({filteredFriends.length})
            </Text>
            <FlatList
              data={filteredFriends}
              renderItem={renderFriend}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={onRefresh} 
                  tintColor="#4CD964"
                  colors={['#4CD964', '#FF9800', '#FF6B6B']}
                  progressBackgroundColor="#1C1C1E"
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={80} color="#3A3A3C" />
                  <Text style={styles.emptyText}>
                    {searchQuery ? 'No friends match your search' : 'No friends yet'}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    {searchQuery ? 'Try a different name' : 'Tap the + button to add friends!'}
                  </Text>
                </View>
              }
            />
          </>
        )}

        {/* Floating Action Button Group */}
        <FAB.Group
          visible={true}
          open={fabOpen}
          icon={fabOpen ? 'close' : 'plus'}
          actions={[
            { icon: 'account-plus', label: 'Add Friend', onPress: openAddFriend },
            { icon: 'account-group', label: 'Create Group', onPress: openCreateGroup },
          ]}
          onStateChange={({ open }) => setFabOpen(open)}
          fabStyle={styles.fab}
          color="#000000"
          backdropColor="rgba(0,0,0,0.5)"
        />

        {/* Add Friend Modal */}
        <Modal
          visible={showAddModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAddModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Friend</Text>
                <TouchableOpacity onPress={() => {
                  setShowAddModal(false);
                  setSearchResults([]);
                  setModalSearchQuery('');
                }}>
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              
              {searchResults.length === 0 ? (
                <>
                  <Text style={styles.modalSubtitle}>Enter username to find friends</Text>
                  <View style={styles.modalSearchSection}>
                    <View style={styles.modalSearchBar}>
                      <Ionicons name="search-outline" size={20} color="#888" />
                      <TextInput
                        style={styles.modalSearchInput}
                        placeholder="Username"
                        placeholderTextColor="#8E8E93"
                        value={modalSearchQuery}
                        onChangeText={setModalSearchQuery}
                        autoCapitalize="none"
                        onSubmitEditing={searchUsersToAdd}
                      />
                      {modalSearchQuery !== '' && (
                        <TouchableOpacity onPress={() => setModalSearchQuery('')}>
                          <Ionicons name="close-circle" size={20} color="#888" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <TouchableOpacity 
                      style={styles.modalSearchButton}
                      onPress={searchUsersToAdd}
                      disabled={searchingUsers}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.modalSearchButtonText}>
                        {searchingUsers ? 'Searching...' : 'Search'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalSubtitle}>Search Results ({searchResults.length})</Text>
                  <FlatList
                    data={searchResults}
                    renderItem={renderSearchResult}
                    keyExtractor={(item) => item.id}
                    style={styles.modalList}
                    showsVerticalScrollIndicator={false}
                  />
                  <TouchableOpacity 
                    style={styles.modalBackButton}
                    onPress={() => {
                      setSearchResults([]);
                      setModalSearchQuery('');
                    }}
                  >
                    <Text style={styles.modalBackButtonText}>Back to Search</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* Friend Action Modal (Unfriend / Block) */}
        <Modal
          visible={showFriendMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFriendMenu(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowFriendMenu(false)}
          >
            <View style={styles.actionSheet}>
              <Text style={styles.actionSheetTitle}>Manage Friend</Text>
              <Text style={styles.actionSheetSubtitle}>{selectedFriend?.username}</Text>
              <TouchableOpacity 
                style={styles.actionItem} 
                onPress={() => unfriendUser(selectedFriend?.id, selectedFriend?.username)}
              >
                <Ionicons name="person-remove-outline" size={24} color="#FF9800" />
                <Text style={[styles.actionText, styles.unfriendText]}>Unfriend</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionItem} 
                onPress={() => blockUser(selectedFriend?.id, selectedFriend?.username)}
              >
                <Ionicons name="ban-outline" size={24} color="#FF3B30" />
                <Text style={[styles.actionText, styles.blockText]}>Block</Text>
              </TouchableOpacity>
              <View style={styles.actionDivider} />
              <TouchableOpacity style={styles.actionItem} onPress={() => setShowFriendMenu(false)}>
                <Ionicons name="close-outline" size={24} color="#888" />
                <Text style={styles.actionText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,  
    paddingBottom: 12,  
    paddingHorizontal: 20,
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  headerTitle: {
    fontSize: 25,  
    fontWeight: 'bold',
    color: '#4CD964',
    textShadowColor: '#4CD964',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  userGreeting: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10, 
  },
  headerButton: {
    padding: 6,  
  },
  searchSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#000000',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    fontSize: 16,
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    color: '#FFFFFF',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4CD964',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarText: {
    fontSize: 20,
    color: '#000000',
    fontWeight: 'bold',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CD964',
    borderWidth: 2,
    borderColor: '#1C1C1E',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  friendEmail: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  newMessageText: {
    fontSize: 12,
    color: '#4CD964',
    fontWeight: '500',
    marginTop: 2,
  },
  onlineText: {
    fontSize: 12,
    color: '#4CD964',
    fontWeight: '500',
    marginTop: 2,
  },
  rightContainer: {
    alignItems: 'flex-end',
    gap: 8,
  },
  unreadBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  groupAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF9800',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  groupMembers: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#8E8E93',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#3A3A3C',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  skeletonContainer: {
    padding: 16,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  skeletonAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2C2C2E',
    marginRight: 12,
  },
  skeletonTextContainer: {
    flex: 1,
  },
  skeletonName: {
    width: '60%',
    height: 16,
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    marginBottom: 8,
  },
  skeletonEmail: {
    width: '40%',
    height: 12,
    backgroundColor: '#2C2C2E',
    borderRadius: 6,
  },
  fab: {
    backgroundColor: '#4CD964',
    borderRadius: 28,
    shadowColor: '#4CD964',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 16,
  },
  modalSearchSection: {
    flexDirection: 'row',
    gap: 12,
  },
  modalSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  modalSearchInput: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    fontSize: 16,
    color: '#FFFFFF',
  },
  modalSearchButton: {
    backgroundColor: '#4CD964',
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: 12,
  },
  modalSearchButtonText: {
    color: '#000000',
    fontWeight: '600',
    fontSize: 14,
  },
  modalList: {
    maxHeight: 400,
  },
  modalBackButton: {
    backgroundColor: '#2C2C2E',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  modalBackButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#4CD964',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#4CD964',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 5,
  },
  addButtonDisabled: {
    backgroundColor: '#3A3A3C',
    shadowOpacity: 0,
  },
  addButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
  searchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  alreadyFriendButton: {
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  alreadyFriendText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  // Action Sheet Styles (for friend menu)
  actionSheet: {
    backgroundColor: '#2C2C2C',
    borderRadius: 14,
    padding: 16,
    width: '85%',
    maxWidth: 300,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  actionSheetSubtitle: {
    fontSize: 14,
    color: '#AAAAAA',
    textAlign: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#444444',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  unfriendText: {
    color: '#FF9800',
  },
  blockText: {
    color: '#FF3B30',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#444444',
    marginVertical: 8,
  },
});

export default HomeScreen;