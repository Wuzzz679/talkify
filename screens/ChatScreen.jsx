import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Image,
  ActivityIndicator
} from 'react-native';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { auth, db } from '../config/firebase';
import { Ionicons } from '@expo/vector-icons';

export default function ChatScreen({ navigation, route }) {
  const { friend } = route.params;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [sendingImage, setSendingImage] = useState(false);
  const typingTimeoutRef = useRef(null);
  const storage = getStorage();

  // Reactions list
  const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥'];

  useEffect(() => {
    const chatRoomId = [auth.currentUser.uid, friend.id].sort().join('_');
    setChatId(chatRoomId);
    
    // Load messages
    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'));
    
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const messagesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      }));
      setMessages(messagesList);
    });
    
    // Typing listener
    const typingRef = doc(db, 'typing', chatRoomId);
    const unsubscribeTyping = onSnapshot(typingRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data()[friend.id]) {
        setOtherUserTyping(true);
      } else {
        setOtherUserTyping(false);
      }
    });
    
    return () => {
      unsubscribeMessages();
      unsubscribeTyping();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [friend.id]);

  // Auto-mark messages as read when they appear
  useEffect(() => {
    messages.forEach(async (message) => {
      const isMyMessage = message.userId === auth.currentUser?.uid;
      if (!isMyMessage && !message.read) {
        const messageRef = doc(db, 'chats', chatId, 'messages', message.id);
        await updateDoc(messageRef, { read: true });
      }
    });
  }, [messages, chatId]);

  // Handle typing indicator
  const handleTyping = async (text) => {
    setNewMessage(text);
    
    if (text.length > 0 && !isTyping) {
      setIsTyping(true);
      const typingRef = doc(db, 'typing', chatId);
      await updateDoc(typingRef, {
        [auth.currentUser.uid]: true,
      });
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(async () => {
        setIsTyping(false);
        await updateDoc(typingRef, {
          [auth.currentUser.uid]: false,
        });
      }, 1500);
    } else if (text.length === 0 && isTyping) {
      setIsTyping(false);
      const typingRef = doc(db, 'typing', chatId);
      await updateDoc(typingRef, {
        [auth.currentUser.uid]: false,
      });
    }
  };

  // Send text message
  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    await addDoc(messagesRef, {
      text: newMessage,
      createdAt: new Date(),
      userId: auth.currentUser.uid,
      userName: auth.currentUser.email?.split('@')[0],
      read: false,
    });
    setNewMessage('');
  };

  // Pick image from gallery
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Please grant gallery access to send images');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      sendImage(result.assets[0].uri);
    }
  };

  // Take photo with camera
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Please grant camera access');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      sendImage(result.assets[0].uri);
    }
  };

  // Send image
  const sendImage = async (uri) => {
    setSendingImage(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const imageRef = ref(storage, `chats/${chatId}/${Date.now()}.jpg`);
      await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(imageRef);
      
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        imageUrl: imageUrl,
        createdAt: new Date(),
        userId: auth.currentUser.uid,
        userName: auth.currentUser.email?.split('@')[0],
        read: false,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to send image');
    } finally {
      setSendingImage(false);
    }
  };

  // Show image options
  const showImageOptions = () => {
    Alert.alert(
      'Send Image',
      'Choose an option',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose from Gallery', onPress: pickImage },
        { text: 'Take Photo', onPress: takePhoto },
      ]
    );
  };

  // Add reaction to message
  const addReaction = async (messageId, reaction) => {
    const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
    await updateDoc(messageRef, { reaction });
    setSelectedMessage(null);
  };

  // Render each message
  const renderMessage = ({ item }) => {
    const isMyMessage = item.userId === auth.currentUser?.uid;
    
    return (
      <View style={[styles.messageRow, isMyMessage && styles.myMessageRow]}>
        {!isMyMessage && (
          <View style={styles.messageAvatarContainer}>
            {friend?.avatarUrl ? (
              <Image source={{ uri: friend.avatarUrl }} style={styles.messageAvatar} />
            ) : (
              <View style={styles.messageAvatarPlaceholder}>
                <Text style={styles.messageAvatarText}>{friend?.username?.[0]?.toUpperCase()}</Text>
              </View>
            )}
          </View>
        )}
        
        <TouchableOpacity 
          style={[styles.messageWrapper, isMyMessage && styles.myMessageWrapper]}
          onLongPress={() => setSelectedMessage(item)}
          activeOpacity={0.7}
          delayLongPress={300}
        >
          <View style={[styles.messageBubble, isMyMessage && styles.myMessageBubble]}>
            {!isMyMessage && (
              <Text style={styles.userName}>{item.userName}</Text>
            )}
            
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.messageImage} />
            ) : (
              <Text style={[styles.messageText, isMyMessage && styles.myMessageText]}>
                {item.text}
              </Text>
            )}
            
            <View style={styles.messageFooter}>
              <Text style={[styles.timeText, isMyMessage && styles.myTimeText]}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {item.reaction && (
                <Text style={styles.reactionBadge}>{item.reaction}</Text>
              )}
              {isMyMessage && item.read && (
                <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.7)" />
              )}
              {isMyMessage && !item.read && (
                <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.5)" />
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header with Friend's Avatar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          {friend?.avatarUrl ? (
            <Image source={{ uri: friend.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarText}>{friend?.username?.[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>{friend.username}</Text>
            {otherUserTyping && (
              <Text style={styles.typingStatus}>typing...</Text>
            )}
          </View>
        </View>
        
        <TouchableOpacity onPress={showImageOptions} style={styles.imageButton}>
          <Ionicons name="image-outline" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Typing Indicator */}
      {otherUserTyping && (
        <View style={styles.typingContainer}>
          <View style={styles.typingDots}>
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotDelay]} />
            <View style={[styles.dot, styles.dotDelay2]} />
          </View>
          <Text style={styles.typingText}>{friend.username} is typing...</Text>
        </View>
      )}

      {/* Sending Image Indicator */}
      {sendingImage && (
        <View style={styles.sendingContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.sendingText}>Sending image...</Text>
        </View>
      )}

      {/* Messages List */}
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={styles.messagesList}
      />

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={handleTyping}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          multiline
        />
        <TouchableOpacity 
          style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]} 
          onPress={sendMessage}
          disabled={!newMessage.trim()}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Reactions Modal */}
      <Modal
        visible={!!selectedMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMessage(null)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setSelectedMessage(null)}
        >
          <View style={styles.reactionsContainer}>
            {reactions.map((reaction) => (
              <TouchableOpacity
                key={reaction}
                onPress={() => addReaction(selectedMessage.id, reaction)}
                style={styles.reactionButton}
              >
                <Text style={styles.reactionEmoji}>{reaction}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
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
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  typingStatus: {
    fontSize: 10,
    color: '#4CD964',
    fontStyle: 'italic',
  },
  imageButton: {
    padding: 8,
    marginRight: -8,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  typingDots: {
    flexDirection: 'row',
    marginRight: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#007AFF',
    marginHorizontal: 2,
    opacity: 0.6,
  },
  dotDelay: {
    opacity: 0.3,
  },
  dotDelay2: {
    opacity: 0.1,
  },
  typingText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  sendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sendingText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    alignItems: 'flex-end',
  },
  myMessageRow: {
    justifyContent: 'flex-end',
  },
  messageAvatarContainer: {
    marginRight: 8,
    marginBottom: 4,
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  messageAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageAvatarText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
  },
  messageWrapper: {
    maxWidth: '80%',
  },
  myMessageWrapper: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  myMessageBubble: {
    backgroundColor: '#007AFF',
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#000',
  },
  myMessageText: {
    color: '#fff',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginVertical: 4,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 6,
  },
  timeText: {
    fontSize: 10,
    color: '#999',
  },
  myTimeText: {
    color: 'rgba(255,255,255,0.7)',
  },
  reactionBadge: {
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    fontSize: 16,
    maxHeight: 100,
    backgroundColor: '#f8f9fa',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#fff',
    borderRadius: 40,
    padding: 12,
    maxWidth: '90%',
    justifyContent: 'center',
  },
  reactionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reactionEmoji: {
    fontSize: 32,
  },
});