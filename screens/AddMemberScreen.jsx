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
import { doc, getDoc, updateDoc, arrayUnion, collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function AddMemberScreen({ navigation, route }) {
  const { groupId, groupName } = route.params;
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const friendIds = userDoc.data().friends || [];
        const groupDoc = await getDoc(doc(db, 'groups', groupId));
        const currentMembers = groupDoc.exists() ? groupDoc.data().members || [] : [];
        
        const friendsList = [];
        for (const friendId of friendIds) {
          if (currentMembers.includes(friendId)) continue;
          const friendDoc = await getDoc(doc(db, 'users', friendId));
          if (friendDoc.exists()) {
            friendsList.push({ id: friendDoc.id, ...friendDoc.data() });
          }
        }
        setFriends(friendsList);
      }
    } catch (error) {
      console.error('Error loading friends:', error);
      Alert.alert('Error', 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  const addMemberToGroup = async (userId, userName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAddingId(userId);
    try {
      const groupRef = doc(db, 'groups', groupId);
      const userRef = doc(db, 'users', userId);
      
      await updateDoc(groupRef, {
        members: arrayUnion(userId),
      });
      
      await updateDoc(userRef, {
        groups: arrayUnion(groupId),
      });
      
      // Get current user's username for system message
      const currentUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const currentUserName = currentUserDoc.exists() ? currentUserDoc.data().username : auth.currentUser.email?.split('@')[0] || 'Someone';
      
      const messagesRef = collection(db, 'groupMessages', groupId, 'messages');
      await addDoc(messagesRef, {
        type: 'system',
        text: `${currentUserName} added ${userName} to the group`,
        createdAt: new Date(),
        bumpedAt: new Date(),
        userId: 'system',
        userName: 'System',
        read: false,
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Added', `${userName} added to group`);
      loadFriends(); // refresh list
    } catch (error) {
      console.error('Error adding member:', error);
      Alert.alert('Error', 'Failed to add member');
    } finally {
      setAddingId(null);
    }
  };

  const renderFriend = ({ item }) => (
    <View style={styles.friendCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase()}</Text>
      </View>
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{item.username}</Text>
        <Text style={styles.friendEmail}>{item.email}</Text>
      </View>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => addMemberToGroup(item.id, item.username)}
        disabled={addingId === item.id}
      >
        {addingId === item.id ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Text style={styles.addButtonText}>Add</Text>
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
        <Text style={styles.headerTitle}>Add Members</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitle}>Add to "{groupName}"</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#4CD964" style={{ marginTop: 40 }} />
      ) : friends.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color="#3A3A3C" />
          <Text style={styles.emptyText}>No friends to add</Text>
          <Text style={styles.emptySubtext}>
            All your friends are already in this group.
          </Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          renderItem={renderFriend}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
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
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
  addButton: {
    backgroundColor: '#4CD964',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#000000',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
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