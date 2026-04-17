import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  ActivityIndicator,
  Platform
} from 'react-native';
import { doc, getDoc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Ionicons } from '@expo/vector-icons';
import ConfettiCannon from 'react-native-confetti-cannon';

const FriendRequestsScreen = ({ navigation }) => {
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('incoming');
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiRef = useRef(null);

  useEffect(() => {
    loadRequests();
    
    const unsubscribe = navigation.addListener('focus', () => {
      loadRequests();
    });
    
    return unsubscribe;
  }, [navigation]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        
        // Incoming: friendRequests array
        const incomingIds = data.friendRequests || [];
        const incomingList = [];
        for (const id of incomingIds) {
          const docSnap = await getDoc(doc(db, 'users', id));
          if (docSnap.exists()) {
            incomingList.push({ id: docSnap.id, ...docSnap.data() });
          }
        }
        setIncomingRequests(incomingList);

        // Outgoing: sentRequests array
        const outgoingIds = data.sentRequests || [];
        const outgoingList = [];
        for (const id of outgoingIds) {
          const docSnap = await getDoc(doc(db, 'users', id));
          if (docSnap.exists()) {
            outgoingList.push({ id: docSnap.id, ...docSnap.data() });
          }
        }
        setOutgoingRequests(outgoingList);
      }
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const acceptRequest = async (userId) => {
    if (processingId === userId) return;
    setProcessingId(userId);
    try {
      const currentUserRef = doc(db, 'users', auth.currentUser.uid);
      const friendUserRef = doc(db, 'users', userId);
      
      await updateDoc(currentUserRef, {
        friends: arrayUnion(userId),
        friendRequests: arrayRemove(userId)
      });
      
      await updateDoc(friendUserRef, {
        friends: arrayUnion(auth.currentUser.uid),
        sentRequests: arrayRemove(auth.currentUser.uid)  // remove from their sentRequests
      });
      
      setShowConfetti(true);
      Alert.alert('Success', 'Friend added!', [
        { text: 'OK', onPress: () => {
          setShowConfetti(false);
          loadRequests();
          navigation.goBack();
        }}
      ]);
    } catch (error) {
      console.error('Error accepting request:', error);
      Alert.alert('Error', 'Failed to accept friend request');
    } finally {
      setProcessingId(null);
    }
  };

  const declineRequest = async (userId) => {
    if (processingId === userId) return;
    setProcessingId(userId);
    try {
      const currentUserRef = doc(db, 'users', auth.currentUser.uid);
      const requesterRef = doc(db, 'users', userId);
      
      await updateDoc(currentUserRef, {
        friendRequests: arrayRemove(userId)
      });
      
      // Also remove from requester's sentRequests if they had it
      await updateDoc(requesterRef, {
        sentRequests: arrayRemove(auth.currentUser.uid)
      });
      
      await loadRequests();
      Alert.alert('Declined', 'Friend request declined');
    } catch (error) {
      console.error('Error declining request:', error);
      Alert.alert('Error', 'Failed to decline friend request');
    } finally {
      setProcessingId(null);
    }
  };

  const cancelRequest = async (userId, userName) => {
    if (processingId === userId) return;
    Alert.alert(
      'Cancel Request',
      `Cancel friend request to ${userName}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(userId);
            try {
              const currentUserRef = doc(db, 'users', auth.currentUser.uid);
              const targetUserRef = doc(db, 'users', userId);
              
              // Remove from current user's sentRequests
              await updateDoc(currentUserRef, {
                sentRequests: arrayRemove(userId)
              });
              
              // Remove from target user's friendRequests
              await updateDoc(targetUserRef, {
                friendRequests: arrayRemove(auth.currentUser.uid)
              });
              
              await loadRequests();
              Alert.alert('Cancelled', 'Friend request cancelled');
            } catch (error) {
              console.error('Error cancelling request:', error);
              Alert.alert('Error', 'Failed to cancel request');
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  const renderIncomingRequest = ({ item }) => (
    <View style={styles.requestCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase()}</Text>
      </View>
      <View style={styles.requestInfo}>
        <Text style={styles.userName}>{item.username}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
      </View>
      <View style={styles.buttons}>
        <TouchableOpacity 
          style={[styles.acceptButton, processingId === item.id && styles.buttonDisabled]} 
          onPress={() => acceptRequest(item.id)}
          disabled={processingId === item.id}
        >
          <Text style={styles.acceptText}>
            {processingId === item.id ? 'Adding...' : 'Accept'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.declineButton, processingId === item.id && styles.buttonDisabled]} 
          onPress={() => declineRequest(item.id)}
          disabled={processingId === item.id}
        >
          <Text style={styles.declineText}>
            {processingId === item.id ? '...' : 'Decline'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderOutgoingRequest = ({ item }) => (
    <View style={styles.requestCard}>
      <View style={styles.avatarOutgoing}>
        <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase()}</Text>
      </View>
      <View style={styles.requestInfo}>
        <Text style={styles.userName}>{item.username}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
      </View>
      <TouchableOpacity 
        style={[styles.cancelButton, processingId === item.id && styles.buttonDisabled]} 
        onPress={() => cancelRequest(item.id, item.username)}
        disabled={processingId === item.id}
      >
        <Text style={styles.cancelText}>
          {processingId === item.id ? 'Cancelling...' : 'Cancel Request'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="person-add-outline" size={64} color="#3A3A3C" />
      <Text style={styles.emptyText}>
        {activeTab === 'incoming' ? 'No incoming requests' : 'No outgoing requests'}
      </Text>
      <Text style={styles.emptySubtext}>
        {activeTab === 'incoming' 
          ? 'When someone adds you, you\'ll see it here' 
          : 'When you send a request, it will appear here'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#4CD964" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friend Requests</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'incoming' && styles.activeTab]} 
          onPress={() => setActiveTab('incoming')}
        >
          <Text style={[styles.tabText, activeTab === 'incoming' && styles.activeTabText]}>
            Incoming ({incomingRequests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'outgoing' && styles.activeTab]} 
          onPress={() => setActiveTab('outgoing')}
        >
          <Text style={[styles.tabText, activeTab === 'outgoing' && styles.activeTabText]}>
            Outgoing ({outgoingRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CD964" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <FlatList
          data={activeTab === 'incoming' ? incomingRequests : outgoingRequests}
          renderItem={activeTab === 'incoming' ? renderIncomingRequest : renderOutgoingRequest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={renderEmpty}
        />
      )}

      {showConfetti && (
        <ConfettiCannon
          count={200}
          origin={{ x: -10, y: 0 }}
          fallSpeed={3000}
          explosionSpeed={350}
          colors={['#4CD964', '#FF9800', '#FF6B6B', '#4CD964', '#2196F3', '#9C27B0']}
          autoStart={true}
          fadeOut={true}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  backButton: {
    padding: 6,
    marginLeft: -6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  activeTab: {
    backgroundColor: '#4CD964',
  },
  tabText: {
    color: '#8E8E93',
    fontWeight: '600',
    fontSize: 14,
  },
  activeTabText: {
    color: '#000000',
  },
  list: {
    padding: 16,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4CD964',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarOutgoing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF9800',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    color: '#000000',
    fontWeight: 'bold',
  },
  requestInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  userEmail: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
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
  acceptText: {
    color: '#000000',
    fontWeight: '600',
  },
  declineButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  declineText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#FF9800',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  cancelText: {
    color: '#000000',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
});

export default FriendRequestsScreen;