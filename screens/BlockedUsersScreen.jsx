import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { doc, getDoc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function BlockedUsersScreen({ navigation }) {
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState(null);

  useEffect(() => {
    loadBlockedUsers();
  }, []);

  const loadBlockedUsers = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const blockedIds = userDoc.data().blocked || [];
        const blockedList = [];
        for (const userId of blockedIds) {
          const userSnap = await getDoc(doc(db, 'users', userId));
          if (userSnap.exists()) {
            blockedList.push({ id: userSnap.id, ...userSnap.data() });
          }
        }
        setBlockedUsers(blockedList);
      }
    } catch (error) {
      console.error('Error loading blocked users:', error);
      Alert.alert('Error', 'Failed to load blocked users');
    } finally {
      setLoading(false);
    }
  };

  const unblockUser = async (userId, userName) => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  Alert.alert(
    'Unblock User',
    `Are you sure you want to unblock ${userName}? They will be added back to your friends list.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock & Add Friend',
        onPress: async () => {
          setUnblockingId(userId);
          try {
            const currentUserRef = doc(db, 'users', auth.currentUser.uid);
            const targetUserRef = doc(db, 'users', userId);

            // Remove from blocked array and add to friends array for current user
            await updateDoc(currentUserRef, {
              blocked: arrayRemove(userId),
              friends: arrayUnion(userId),
            });

            // Also add current user to target user's friends array (optional but restores mutual friendship)
            await updateDoc(targetUserRef, {
              friends: arrayUnion(auth.currentUser.uid),
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Unblocked', `${userName} has been unblocked and added back to your friends.`);
            // Refresh the blocked list (which will remove the entry)
            loadBlockedUsers();
            // Also refresh the friend list in HomeScreen (optional, but will update on next focus)
          } catch (error) {
            console.error('Error unblocking:', error);
            Alert.alert('Error', 'Failed to unblock user');
          } finally {
            setUnblockingId(null);
          }
        },
      },
    ]
  );
};
  const renderBlockedUser = ({ item }) => (
    <View style={styles.blockedCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase()}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.username}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
      </View>
      <TouchableOpacity
        style={styles.unblockButton}
        onPress={() => unblockUser(item.id, item.username)}
        disabled={unblockingId === item.id}
      >
        {unblockingId === item.id ? (
          <ActivityIndicator size="small" color="#4CD964" />
        ) : (
          <Text style={styles.unblockButtonText}>Unblock</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#4CD964" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4CD964" style={{ marginTop: 40 }} />
      ) : blockedUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="ban-outline" size={80} color="#3A3A3C" />
          <Text style={styles.emptyText}>No blocked users</Text>
          <Text style={styles.emptySubtext}>
            Users you block will appear here. You can unblock them anytime.
          </Text>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          renderItem={renderBlockedUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

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
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  blockedCard: {
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
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  userInfo: {
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
  unblockButton: {
    backgroundColor: '#4CD964',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  unblockButtonText: {
    color: '#000000',
    fontWeight: '600',
    fontSize: 14,
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
});