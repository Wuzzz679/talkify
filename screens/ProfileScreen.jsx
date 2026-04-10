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
    console.log('Change profile picture pressed');
    
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('Permission result:', permissionResult);
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Needed', 'Please grant gallery access to change profile picture');
        return;
      }

      // Launch image picker - FIXED: Use 'images' string instead of ImagePicker.MediaType.Images
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',  // ← This is the fix
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      console.log('Image picker result:', result.canceled ? 'cancelled' : 'selected');

      if (!result.canceled) {
        setUpdating(true);
        try {
          const uri = result.assets[0].uri;
          console.log('Image URI:', uri);
          
          // Convert image to Base64
          const response = await fetch(uri);
          const blob = await response.blob();
          console.log('Blob size:', blob.size);
          
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              console.log('Base64 conversion complete');
              resolve(reader.result);
            };
            reader.onerror = (error) => {
              console.error('Reader error:', error);
              reject(error);
            };
            reader.readAsDataURL(blob);
          });
          
          // Save to Firestore
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
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
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
              <Ionicons name="camera" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.userEmail}>{auth.currentUser?.email}</Text>
          <Text style={styles.tapText}>Tap camera icon to change photo</Text>
        </View>

        <View style={styles.infoSection}>
          <TouchableOpacity style={styles.infoRow} onPress={() => { setEditField('username'); setEditValue(userData?.username || ''); }}>
            <View style={styles.infoLabelContainer}>
              <Ionicons name="person-outline" size={20} color="#007AFF" />
              <Text style={styles.infoLabel}>Username</Text>
            </View>
            <View style={styles.infoValueContainer}>
              <Text style={styles.infoValue}>{userData?.username || 'Not set'}</Text>
              <Ionicons name="chevron-forward-outline" size={20} color="#999" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.infoRow} onPress={() => { setEditField('bio'); setEditValue(userData?.bio || ''); }}>
            <View style={styles.infoLabelContainer}>
              <Ionicons name="chatbubble-outline" size={20} color="#007AFF" />
              <Text style={styles.infoLabel}>Bio</Text>
            </View>
            <View style={styles.infoValueContainer}>
              <Text style={[styles.infoValue, !userData?.bio && styles.placeholderText]}>
                {userData?.bio || 'Add bio'}
              </Text>
              <Ionicons name="chevron-forward-outline" size={20} color="#999" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.infoRow} onPress={() => setShowPasswordModal(true)}>
            <View style={styles.infoLabelContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#007AFF" />
              <Text style={styles.infoLabel}>Password</Text>
            </View>
            <View style={styles.infoValueContainer}>
              <Text style={styles.infoValue}>••••••••</Text>
              <Ionicons name="chevron-forward-outline" size={20} color="#999" />
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
              placeholderTextColor="#999"
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
              placeholderTextColor="#999"
              secureTextEntry 
              value={newPassword} 
              onChangeText={setNewPassword} 
            />
            <TextInput 
              style={styles.modalInput} 
              placeholder="Confirm New Password" 
              placeholderTextColor="#999"
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
    backgroundColor: '#f8f9fa' 
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingTop: Platform.OS === 'ios' ? 60 : 40, 
    paddingHorizontal: 20, 
    paddingBottom: 15, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#e0e0e0' 
  },
  backButton: { 
    padding: 8, 
    marginLeft: -8 
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#000' 
  },
  content: { 
    paddingBottom: 40 
  },
  avatarSection: { 
    alignItems: 'center', 
    paddingVertical: 24, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#e0e0e0' 
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
    backgroundColor: '#007AFF', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  avatarText: { 
    fontSize: 40, 
    color: '#fff', 
    fontWeight: 'bold' 
  },
  cameraIcon: { 
    position: 'absolute', 
    bottom: 0, 
    right: 0, 
    backgroundColor: '#007AFF', 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 2, 
    borderColor: '#fff' 
  },
  userEmail: { 
    fontSize: 14, 
    color: '#666' 
  },
  tapText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  infoSection: { 
    backgroundColor: '#fff', 
    marginTop: 16, 
    paddingHorizontal: 16 
  },
  infoRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#f0f0f0' 
  },
  infoLabelContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  infoLabel: { 
    fontSize: 16, 
    color: '#333', 
    fontWeight: '500' 
  },
  infoValueContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  infoValue: { 
    fontSize: 16, 
    color: '#000' 
  },
  placeholderText: { 
    color: '#999' 
  },
  logoutButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    backgroundColor: '#fff', 
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
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modalContent: { 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    padding: 20, 
    width: '85%' 
  },
  modalTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    marginBottom: 20, 
    color: '#000' 
  },
  modalInput: { 
    borderWidth: 1, 
    borderColor: '#e0e0e0', 
    borderRadius: 12, 
    padding: 14, 
    fontSize: 16, 
    marginBottom: 16, 
    backgroundColor: '#f8f9fa', 
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
    backgroundColor: '#f0f0f0' 
  },
  saveModalButton: { 
    backgroundColor: '#007AFF' 
  },
  cancelModalText: { 
    color: '#666', 
    fontWeight: '600' 
  },
  saveModalText: { 
    color: '#fff', 
    fontWeight: '600' 
  },
});

export default ProfileScreen;