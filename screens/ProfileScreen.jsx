import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Modal,
  Platform
} from 'react-native';
import { auth, db } from '../config/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updatePassword, signOut } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

const ProfileScreen = ({ navigation }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [editField, setEditField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        setUserData(userDoc.data());
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const changeProfilePicture = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Needed', 'Please grant gallery access to change profile picture');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled) {
        setUpdating(true);
        try {
          const uri = result.assets[0].uri;
          const response = await fetch(uri);
          const blob = await response.blob();
          
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            avatarUrl: base64,
            updatedAt: new Date(),
          });
          
          setUserData({ ...userData, avatarUrl: base64 });
          Alert.alert('Success', 'Profile picture updated!');
        } catch (error) {
          console.error('Upload error:', error);
          Alert.alert('Error', 'Failed to update profile picture: ' + error.message);
        } finally {
          setUpdating(false);
        }
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Could not open image picker');
    }
  };

  const updateUsername = async () => {
    if (!editValue.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }
    
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        username: editValue,
        updatedAt: new Date(),
      });
      setUserData({ ...userData, username: editValue });
      Alert.alert('Success', 'Username updated!');
      setEditField(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to update username');
    } finally {
      setUpdating(false);
    }
  };

  const updateBio = async () => {
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        bio: editValue,
        updatedAt: new Date(),
      });
      setUserData({ ...userData, bio: editValue });
      Alert.alert('Success', 'Bio updated!');
      setEditField(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to update bio');
    } finally {
      setUpdating(false);
    }
  };

  const changePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    
    setUpdating(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      Alert.alert('Success', 'Password changed successfully!');
      setShowPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to change password');
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => signOut(auth) }
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CD964" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#4CD964" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          <TouchableOpacity 
            onPress={changeProfilePicture} 
            style={styles.avatarContainer}
            activeOpacity={0.7}
          >
            {userData?.avatarUrl ? (
              <Image source={{ uri: userData.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {userData?.username?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}
            <View style={styles.cameraIcon}>
              <Ionicons name="camera" size={20} color="#000000" />
            </View>
          </TouchableOpacity>
          <Text style={styles.userEmail}>{auth.currentUser?.email}</Text>
          <Text style={styles.tapText}>Tap camera icon to change photo</Text>
        </View>

        <View style={styles.infoSection}>
          <TouchableOpacity style={styles.infoRow} onPress={() => { setEditField('username'); setEditValue(userData?.username || ''); }}>
            <View style={styles.infoLabelContainer}>
              <Ionicons name="person-outline" size={20} color="#4CD964" />
              <Text style={styles.infoLabel}>Username</Text>
            </View>
            <View style={styles.infoValueContainer}>
              <Text style={styles.infoValue}>{userData?.username || 'Not set'}</Text>
              <Ionicons name="chevron-forward-outline" size={20} color="#8E8E93" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.infoRow} onPress={() => { setEditField('bio'); setEditValue(userData?.bio || ''); }}>
            <View style={styles.infoLabelContainer}>
              <Ionicons name="chatbubble-outline" size={20} color="#4CD964" />
              <Text style={styles.infoLabel}>Bio</Text>
            </View>
            <View style={styles.infoValueContainer}>
              <Text style={[styles.infoValue, !userData?.bio && styles.placeholderText]}>
                {userData?.bio || 'Add bio'}
              </Text>
              <Ionicons name="chevron-forward-outline" size={20} color="#8E8E93" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.infoRow} onPress={() => setShowPasswordModal(true)}>
            <View style={styles.infoLabelContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#4CD964" />
              <Text style={styles.infoLabel}>Password</Text>
            </View>
            <View style={styles.infoValueContainer}>
              <Text style={styles.infoValue}>••••••••</Text>
              <Ionicons name="chevron-forward-outline" size={20} color="#8E8E93" />
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!editField} transparent animationType="slide" onRequestClose={() => setEditField(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit {editField === 'username' ? 'Username' : 'Bio'}</Text>
            <TextInput
              style={styles.modalInput}
              value={editValue}
              onChangeText={setEditValue}
              placeholder={`Enter new ${editField}`}
              placeholderTextColor="#8E8E93"
              multiline={editField === 'bio'}
              numberOfLines={editField === 'bio' ? 3 : 1}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelModalButton]} onPress={() => setEditField(null)}>
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveModalButton]} onPress={editField === 'username' ? updateUsername : updateBio} disabled={updating}>
                <Text style={styles.saveModalText}>{updating ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPasswordModal} transparent animationType="slide" onRequestClose={() => setShowPasswordModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <TextInput 
              style={styles.modalInput} 
              placeholder="New Password (min 6 chars)" 
              placeholderTextColor="#8E8E93"
              secureTextEntry 
              value={newPassword} 
              onChangeText={setNewPassword} 
            />
            <TextInput 
              style={styles.modalInput} 
              placeholder="Confirm New Password" 
              placeholderTextColor="#8E8E93"
              secureTextEntry 
              value={confirmPassword} 
              onChangeText={setConfirmPassword} 
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelModalButton]} onPress={() => setShowPasswordModal(false)}>
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveModalButton]} onPress={changePassword} disabled={updating}>
                <Text style={styles.saveModalText}>{updating ? 'Changing...' : 'Change'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000000' 
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#000000' 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingTop: Platform.OS === 'ios' ? 60 : 40, 
    paddingHorizontal: 20, 
    paddingBottom: 15, 
    backgroundColor: '#1C1C1E', 
    borderBottomWidth: 1, 
    borderBottomColor: '#2C2C2E' 
  },
  backButton: { 
    padding: 8, 
    marginLeft: -8 
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#FFFFFF' 
  },
  content: { 
    paddingBottom: 40 
  },
  avatarSection: { 
    alignItems: 'center', 
    paddingVertical: 24, 
    backgroundColor: '#1C1C1E', 
    borderBottomWidth: 1, 
    borderBottomColor: '#2C2C2E' 
  },
  avatarContainer: { 
    position: 'relative', 
    marginBottom: 12 
  },
  avatar: { 
    width: 100, 
    height: 100, 
    borderRadius: 50 
  },
  avatarPlaceholder: { 
    width: 100, 
    height: 100, 
    borderRadius: 50, 
    backgroundColor: '#4CD964', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  avatarText: { 
    fontSize: 40, 
    color: '#000000', 
    fontWeight: 'bold' 
  },
  cameraIcon: { 
    position: 'absolute', 
    bottom: 0, 
    right: 0, 
    backgroundColor: '#4CD964', 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 2, 
    borderColor: '#000000' 
  },
  userEmail: { 
    fontSize: 14, 
    color: '#8E8E93' 
  },
  tapText: {
    fontSize: 12,
    color: '#3A3A3C',
    marginTop: 8,
  },
  infoSection: { 
    backgroundColor: '#1C1C1E', 
    marginTop: 16, 
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 16, 
    paddingHorizontal: 16,
    borderBottomWidth: 1, 
    borderBottomColor: '#2C2C2E' 
  },
  infoLabelContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  infoLabel: { 
    fontSize: 16, 
    color: '#FFFFFF', 
    fontWeight: '500' 
  },
  infoValueContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  infoValue: { 
    fontSize: 16, 
    color: '#8E8E93' 
  },
  placeholderText: { 
    color: '#3A3A3C' 
  },
  logoutButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    backgroundColor: '#1C1C1E', 
    marginTop: 24, 
    marginHorizontal: 16, 
    paddingVertical: 16, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#FF3B30' 
  },
  logoutText: { 
    fontSize: 16, 
    color: '#FF3B30', 
    fontWeight: '600' 
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.9)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modalContent: { 
    backgroundColor: '#1C1C1E', 
    borderRadius: 20, 
    padding: 20, 
    width: '85%' 
  },
  modalTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    marginBottom: 20, 
    color: '#FFFFFF' 
  },
  modalInput: { 
    borderWidth: 1, 
    borderColor: '#2C2C2E', 
    borderRadius: 12, 
    padding: 14, 
    fontSize: 16, 
    marginBottom: 16, 
    backgroundColor: '#000000', 
    color: '#FFFFFF',
    textAlignVertical: 'top' 
  },
  modalButtons: { 
    flexDirection: 'row', 
    gap: 12, 
    marginTop: 8 
  },
  modalButton: { 
    flex: 1, 
    paddingVertical: 12, 
    borderRadius: 12, 
    alignItems: 'center' 
  },
  cancelModalButton: { 
    backgroundColor: '#2C2C2E' 
  },
  saveModalButton: { 
    backgroundColor: '#4CD964' 
  },
  cancelModalText: { 
    color: '#FFFFFF', 
    fontWeight: '600' 
  },
  saveModalText: { 
    color: '#000000', 
    fontWeight: '600' 
  },
});

export default ProfileScreen;