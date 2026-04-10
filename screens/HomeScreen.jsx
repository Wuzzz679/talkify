import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  TextInput,
  ActivityIndicator,
  Image
} from 'react-native';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  arrayUnion, 
  getDoc,
  setDoc,
  onSnapshot
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

const HomeScreen = ({ navigation }) => {
  const [friends, setFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);

  useEffect(() => {
    loadUserData();
    loadFriends();
    
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        loadFriends();
        loadUserData();
      }
    });
    
    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFriends();
      loadUserData();
    }, [])
  );

  const loadUserData = async () => {
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
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const friendIds = userDoc.data().friends || [];
        const friendsList = [];
        for (const friendId of friendIds) {
          const friendDoc = await getDoc(doc(db, 'users', friendId));
          if (friendDoc.exists()) {
            friendsList.push({ id: friendDoc.id, ...friendDoc.data() });
          }
        }
        setFriends(friendsList);
      }
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Info', 'Please enter a username to search');
      return;
    }
    
    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '>=', searchQuery), where('username', '<=', searchQuery + '\uf8ff'));
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
        Alert.alert('No Results', `No users found with username "${searchQuery}"`);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      Alert.alert('Error', 'Failed to search users');
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (userId, userUsername) => {
    if (sendingRequest) return;
    
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
      
      Alert.alert('Success', `Friend request sent to ${userUsername}!`);
      
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error sending friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
    } finally {
      setSendingRequest(false);
    }
  };

  const startChat = (friend) => {
    navigation.navigate('Chat', { friend: friend });
  };

  const handleLogout = async () => {
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
              await signOut(auth);
            } catch (error) {
              Alert.alert('Error', 'Failed to logout');
            }
          }
        }
      ]
    );
  };

  const renderFriend = ({ item }) => (
    <TouchableOpacity style={styles.friendCard} onPress={() => startChat(item)}>
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
      <Ionicons name="chatbubble-outline" size={24} color="#007AFF" />
    </TouchableOpacity>
  );

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
        >
          <Text style={styles.addButtonText}>
            {sendingRequest ? 'Sending...' : 'Add Friend'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
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
            <Ionicons name="people-outline" size={28} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.headerButton}>
            <Ionicons name="person-circle-outline" size={28} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.headerButton}>
            <Ionicons name="log-out-outline" size={28} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friends by username..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={searchUsers}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setSearchResults([]);
            }}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchButton} onPress={searchUsers} disabled={loading}>
          <Text style={styles.searchButtonText}>{loading ? 'Searching...' : 'Search'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : searchResults.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Search Results ({searchResults.length})</Text>
          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
          />
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>My Friends ({friends.length})</Text>
          <FlatList
            data={friends}
            renderItem={renderFriend}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No friends yet</Text>
                <Text style={styles.emptySubtext}>Search and add friends to start chatting!</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  userGreeting: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
  },
  searchSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: 12,
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    color: '#333',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  friendEmail: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonDisabled: {
    backgroundColor: '#999',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  alreadyFriendButton: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  alreadyFriendText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
});

export default HomeScreen;