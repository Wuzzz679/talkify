import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { doc, setDoc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function CreateGroupScreen({ navigation }) {
  const [friends, setFriends] = useState([]);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    setLoading(true);
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
      Alert.alert('Error', 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectFriend = (friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedFriends.find(f => f.id === friend.id)) {
      setSelectedFriends(selectedFriends.filter(f => f.id !== friend.id));
    } else {
      setSelectedFriends([...selectedFriends, friend]);
    }
  };

  const createGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    if (selectedFriends.length < 2) {
      Alert.alert('Error', 'Please select at least 2 friends to create a group');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCreating(true);

    try {
      const members = [auth.currentUser.uid, ...selectedFriends.map(f => f.id)];
      const groupRef = doc(db, 'groups', `${Date.now()}_${auth.currentUser.uid}`);
      await setDoc(groupRef, {
        name: groupName.trim(),
        members: members,
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        avatarUrl: null,
        lastMessage: '',
        lastMessageTime: null,
      });

      // Add group reference to each member's user document (optional, for quick listing)
      for (const memberId of members) {
        const userRef = doc(db, 'users', memberId);
        await updateDoc(userRef, {
          groups: arrayUnion(groupRef.id)
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Group created!');
      navigation.goBack();
    } catch (error) {
      console.error('Error creating group:', error);
      Alert.alert('Error', 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const renderFriend = ({ item }) => {
    const isSelected = selectedFriends.some(f => f.id === item.id);
    return (
      <TouchableOpacity
        style={[styles.friendItem, isSelected && styles.selectedFriend]}
        onPress={() => toggleSelectFriend(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase()}</Text>
        </View>
        <Text style={styles.friendName}>{item.username}</Text>
        {isSelected && <Ionicons name="checkmark-circle" size={24} color="#4CD964" />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#4CD964" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Group</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Group Name"
          placeholderTextColor="#888"
          value={groupName}
          onChangeText={setGroupName}
          maxLength={30}
        />
      </View>

      <Text style={styles.sectionTitle}>
        Select Friends ({selectedFriends.length} selected)
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#4CD964" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={friends}
          renderItem={renderFriend}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={60} color="#3A3A3C" />
              <Text style={styles.emptyText}>No friends yet</Text>
              <Text style={styles.emptySubtext}>Add friends first to create a group</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.createButton, (selectedFriends.length < 2 || !groupName.trim()) && styles.createButtonDisabled]}
        onPress={createGroup}
        disabled={creating || selectedFriends.length < 2 || !groupName.trim()}
      >
        {creating ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Text style={styles.createButtonText}>Create Group</Text>
        )}
      </TouchableOpacity>
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
  inputContainer: {
    padding: 16,
  },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  list: {
    paddingHorizontal: 16,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  selectedFriend: {
    borderColor: '#4CD964',
    backgroundColor: '#2C2C2E',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CD964',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: 'bold',
  },
  friendName: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  createButton: {
    backgroundColor: '#4CD964',
    margin: 16,
    padding: 14,
    borderRadius: 28,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#3A3A3C',
  },
  createButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
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