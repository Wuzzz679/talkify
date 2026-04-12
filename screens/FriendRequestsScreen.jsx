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
  const [requests, setRequests] = useState([]);
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
      
      await updateDoc(currentUserRef, {
        friends: arrayUnion(userId),
        friendRequests: arrayRemove(userId)
      });
      
      await updateDoc(friendUserRef, {
        friends: arrayUnion(auth.currentUser.uid)
      });
      
      // Show confetti animation
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
      setProcessingId(null);
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
          <Ionicons name="arrow-back" size={24} color="#4CD964" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friend Requests</Text>
        <View style={{ width: 40 }} />
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CD964" />
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
              <Ionicons name="person-add-outline" size={64} color="#3A3A3C" />
              <Text style={styles.emptyText}>No friend requests</Text>
              <Text style={styles.emptySubtext}>When someone adds you, you'll see it here</Text>
            </View>
          }
        />
      )}

      {/* Confetti Animation */}
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