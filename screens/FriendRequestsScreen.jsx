import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  ActivityIndicator
} from 'react-native';
import { doc, getDoc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Ionicons } from '@expo/vector-icons';

const FriendRequestsScreen = ({ navigation }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadRequests();
    
    // Add focus listener to refresh when screen comes into focus
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
        const requestIds = userDoc.data().friendRequests || [];
        const requestsList = [];
        for (const requestId of requestIds) {
          const requestDoc = await getDoc(doc(db, 'users', requestId));
          if (requestDoc.exists()) {
            requestsList.push({ id: requestDoc.id, ...requestDoc.data() });
          }
        }
        setRequests(requestsList);
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
      
      // Update both users' friend lists
      await updateDoc(currentUserRef, {
        friends: arrayUnion(userId),
        friendRequests: arrayRemove(userId)
      });
      
      await updateDoc(friendUserRef, {
        friends: arrayUnion(auth.currentUser.uid)
      });
      
      Alert.alert('Success', 'Friend added!');
      
      // Refresh the requests list
      await loadRequests();
      
      // Navigate back to Home screen to see updated friend list
      navigation.goBack();
      
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
      await updateDoc(currentUserRef, {
        friendRequests: arrayRemove(userId)
      });
      
      await loadRequests();
      Alert.alert('Success', 'Friend request declined');
      
    } catch (error) {
      console.error('Error declining request:', error);
      Alert.alert('Error', 'Failed to decline friend request');
    } finally {
      setProcessingId(null);
    }
  };

  const renderRequest = ({ item }) => (
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friend Requests</Text>
        <View style={{ width: 40 }} />
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderRequest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="person-add-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>No friend requests</Text>
              <Text style={styles.emptySubtext}>When someone adds you, you'll see it here</Text>
            </View>
          }
        />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  list: {
    padding: 16,
  },
  requestCard: {
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
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  requestInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  userEmail: {
    fontSize: 12,
    color: '#999',
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
  },
  acceptText: {
    color: '#fff',
    fontWeight: '600',
  },
  declineButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  declineText: {
    color: '#fff',
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
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
    textAlign: 'center',
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

export default FriendRequestsScreen;