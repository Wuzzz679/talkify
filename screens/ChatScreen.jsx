import React, { useState, useEffect, useRef } from 'react';
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
  ActivityIndicator,
  Animated,
  Dimensions
} from 'react-native';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { auth, db } from '../config/firebase';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Swipeable } from 'react-native-gesture-handler';
import { Audio } from 'expo-av';
import { Image as ExpoImage } from 'expo-image';

const { width, height } = Dimensions.get('window');

export default function ChatScreen({ navigation, route }) {
  const { friend } = route.params;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [sendingImage, setSendingImage] = useState(false);
  const [showNewMessageDivider, setShowNewMessageDivider] = useState(false);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(null);
  const [replyToMsg, setReplyToMsg] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  
  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [sound, setSound] = useState(null);
  
  // Ref to prevent duplicate stop calls
  const isStoppingRef = useRef(false);
  
  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const sendAnimation = useRef(new Animated.Value(1)).current;
  const swipeableRefs = useRef({});
  const recordingAnimation = useRef(new Animated.Value(0)).current;

  // Animated typing indicator values
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥'];

  // Animate recording indicator
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingAnimation, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(recordingAnimation, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      recordingAnimation.setValue(0);
    }
  }, [isRecording]);

  // Typing indicator animation
  useEffect(() => {
    const animateDot = (dot, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };
    
    if (otherUserTyping) {
      animateDot(dot1, 0);
      animateDot(dot2, 150);
      animateDot(dot3, 300);
    } else {
      dot1.setValue(0);
      dot2.setValue(0);
      dot3.setValue(0);
    }
  }, [otherUserTyping]);

  // Clean up sound on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  useEffect(() => {
    const chatRoomId = [auth.currentUser.uid, friend.id].sort().join('_');
    setChatId(chatRoomId);
    
    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
    const q = query(messagesRef, orderBy('bumpedAt', 'asc'));
    
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const messagesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        bumpedAt: doc.data().bumpedAt?.toDate() || doc.data().createdAt?.toDate() || new Date(),
      }));
      
      const sortedMessages = messagesList.sort((a, b) => {
        return a.bumpedAt - b.bumpedAt;
      });
      
      const unreadMessages = sortedMessages.filter(
        msg => msg.userId !== auth.currentUser?.uid && !msg.read
      );
      const unreadCount = unreadMessages.length;
      
      const unreadMessage = unreadMessages[unreadMessages.length - 1];
      
      if (unreadMessage && unreadCount > 0) {
        setFirstUnreadMessageId(unreadMessage.id);
        setShowNewMessageDivider(true);
      } else {
        setFirstUnreadMessageId(null);
        setShowNewMessageDivider(false);
      }
      
      setMessages(sortedMessages);
    });
    
    const typingRef = doc(db, 'typing', chatRoomId);
    const unsubscribeTyping = onSnapshot(typingRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data()[friend.id] === true) {
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

  const markAllMessagesAsRead = async () => {
    if (!chatId) return;
    
    const unreadMessages = messages.filter(
      msg => msg.userId !== auth.currentUser?.uid && !msg.read
    );
    
    if (unreadMessages.length === 0) return;
    
    for (const msg of unreadMessages) {
      const messageRef = doc(db, 'chats', chatId, 'messages', msg.id);
      await updateDoc(messageRef, { read: true });
    }
    
    setShowNewMessageDivider(false);
    setFirstUnreadMessageId(null);
  };

  useEffect(() => {
    if (messages.length > 0 && chatId) {
      markAllMessagesAsRead();
    }
  }, [messages, chatId]);

  // Voice Recording Functions - Fixed (prevents duplicate calls)
  const startRecording = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // First, clean up any existing recording
      if (recording) {
        try {
          await recording.stopAndUnloadAsync();
        } catch (e) {
          // Ignore errors when stopping
        }
        setRecording(null);
      }
      
      // Also clean up any playing sound
      if (sound) {
        try {
          await sound.unloadAsync();
        } catch (e) {
          // Ignore errors
        }
        setSound(null);
        setIsPlaying(false);
        setPlayingId(null);
      }
      
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please grant microphone access to send voice messages');
        return;
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      isStoppingRef.current = false; // Reset stopping flag
      
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
      setIsRecording(false);
      setRecording(null);
    }
  };

  const stopRecording = async () => {
    // Prevent duplicate calls
    if (isStoppingRef.current) {
      console.log('Already stopping recording, ignoring duplicate call');
      return;
    }
    
    // Don't proceed if there's no recording
    if (!recording) {
      setIsRecording(false);
      return;
    }
    
    isStoppingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      // Check if recording exists before stopping
      const recordingStatus = await recording.getStatusAsync();
      if (recordingStatus.isRecording) {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        
        setRecording(null);
        setIsRecording(false);
        
        if (uri) {
          await sendVoiceMessage(uri);
        } else {
          Alert.alert('Error', 'Failed to get recording URI');
        }
      } else {
        setRecording(null);
        setIsRecording(false);
      }
      
    } catch (err) {
      console.error('Failed to stop recording', err);
      setRecording(null);
      setIsRecording(false);
    } finally {
      isStoppingRef.current = false;
    }
  };

  const sendVoiceMessage = async (uri) => {
    if (!chatId) return;
    
    setSendingImage(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        try {
          const base64String = reader.result;
          const messagesRef = collection(db, 'chats', chatId, 'messages');
          await addDoc(messagesRef, {
            voiceBase64: base64String,
            createdAt: new Date(),
            bumpedAt: new Date(),
            userId: auth.currentUser.uid,
            userName: auth.currentUser.email?.split('@')[0],
            read: false,
            type: 'voice',
            duration: 0,
          });
          
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        } catch (error) {
          console.error('Error saving voice message:', error);
          Alert.alert('Error', 'Failed to send voice message');
        } finally {
          setSendingImage(false);
        }
      };
      
      reader.onerror = () => {
        console.error('FileReader error');
        Alert.alert('Error', 'Failed to read voice message');
        setSendingImage(false);
      };
      
      reader.readAsDataURL(blob);
      
    } catch (error) {
      console.error('Error sending voice message:', error);
      Alert.alert('Error', 'Failed to send voice message');
      setSendingImage(false);
    }
  };

  const playVoiceMessage = async (base64Uri, messageId) => {
    try {
      // Stop current playback if any
      if (sound) {
        try {
          await sound.stopAsync();
          await sound.unloadAsync();
        } catch (e) {
          // Ignore errors
        }
        setSound(null);
        setIsPlaying(false);
        setPlayingId(null);
      }
      
      // If clicking the same message that's playing, just stop
      if (playingId === messageId) {
        setPlayingId(null);
        setIsPlaying(false);
        return;
      }
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: base64Uri },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setPlayingId(messageId);
      setIsPlaying(true);
      
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
          setPlayingId(null);
          newSound.unloadAsync();
        }
      });
      
    } catch (error) {
      console.error('Error playing voice message:', error);
      Alert.alert('Error', 'Failed to play voice message');
    }
  };

  const animateSend = () => {
    Animated.sequence([
      Animated.timing(sendAnimation, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(sendAnimation, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateSend();
    
    await markAllMessagesAsRead();
    
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const messageData = {
      text: newMessage,
      createdAt: new Date(),
      bumpedAt: new Date(),
      userId: auth.currentUser.uid,
      userName: auth.currentUser.email?.split('@')[0],
      read: false,
    };
    
    if (replyToMsg) {
      messageData.replyTo = {
        id: replyToMsg.id,
        text: replyToMsg.text || (replyToMsg.imageBase64 ? '📷 Image' : ''),
        userId: replyToMsg.userId,
        userName: replyToMsg.userName,
      };
      setReplyToMsg(null);
    }
    
    await addDoc(messagesRef, messageData);
    setNewMessage('');
    
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleTyping = async (text) => {
    setNewMessage(text);
    
    if (text.length > 0 && !isTyping) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsTyping(true);
      const typingRef = doc(db, 'typing', chatId);
      
      try {
        await setDoc(typingRef, {
          [auth.currentUser.uid]: true,
        }, { merge: true });
      } catch (error) {
        console.error('Error setting typing status:', error);
      }
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(async () => {
        setIsTyping(false);
        const typingRef = doc(db, 'typing', chatId);
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

  const compressImage = async (uri) => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      );
      return result.uri;
    } catch (error) {
      console.error('Error compressing image:', error);
      return uri;
    }
  };

  const pickImage = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please grant gallery access to send images');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0].uri) {
        const compressedUri = await compressImage(result.assets[0].uri);
        await sendImageAsBase64(compressedUri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePhoto = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please grant camera access');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0].uri) {
        const compressedUri = await compressImage(result.assets[0].uri);
        await sendImageAsBase64(compressedUri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const sendImageAsBase64 = async (uri) => {
    if (!chatId) {
      Alert.alert('Error', 'Chat not initialized');
      return;
    }
    
    setSendingImage(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      if (blob.size > 900000) {
        Alert.alert('Error', 'Image is too large. Please choose a smaller image.');
        setSendingImage(false);
        return;
      }
      
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        try {
          const base64String = reader.result;
          const messagesRef = collection(db, 'chats', chatId, 'messages');
          await addDoc(messagesRef, {
            imageBase64: base64String,
            createdAt: new Date(),
            bumpedAt: new Date(),
            userId: auth.currentUser.uid,
            userName: auth.currentUser.email?.split('@')[0],
            read: false,
            type: 'image',
          });
          
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Success', 'Image sent successfully!');
          
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        } catch (error) {
          console.error('Error saving to Firestore:', error);
          Alert.alert('Error', 'Failed to save image. Please try a smaller image.');
        } finally {
          setSendingImage(false);
        }
      };
      
      reader.onerror = () => {
        console.error('FileReader error');
        Alert.alert('Error', 'Failed to read image');
        setSendingImage(false);
      };
      
      reader.readAsDataURL(blob);
      
    } catch (error) {
      console.error('Error sending image:', error);
      Alert.alert('Error', `Failed to send image: ${error.message}`);
      setSendingImage(false);
    }
  };

  const showImageOptions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Send Media',
      'Choose an option',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose from Gallery', onPress: pickImage },
        { text: 'Take Photo', onPress: takePhoto },
      ]
    );
  };

  const addReaction = async (messageId, reaction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
    await updateDoc(messageRef, { reaction });
    setSelectedMessage(null);
  };

  const deleteMessage = async (message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const messageRef = doc(db, 'chats', chatId, 'messages', message.id);
            await deleteDoc(messageRef);
            setShowActionSheet(false);
            setSelectedMessage(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
      ]
    );
  };

  const editMessage = async (message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingMessage(message);
    setEditText(message.text);
    setShowActionSheet(false);
    setSelectedMessage(null);
    
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const saveEditMessage = async () => {
    if (!editText.trim() || !editingMessage) return;
    
    const messageRef = doc(db, 'chats', chatId, 'messages', editingMessage.id);
    await updateDoc(messageRef, {
      text: editText,
      edited: true,
      editedAt: new Date(),
    });
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditingMessage(null);
    setEditText('');
  };

  const togglePinMessage = async (message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const messageRef = doc(db, 'chats', chatId, 'messages', message.id);
    await updateDoc(messageRef, {
      isPinned: !message.isPinned,
      pinnedAt: !message.isPinned ? new Date() : null,
    });
    setShowActionSheet(false);
    setSelectedMessage(null);
    
    if (!message.isPinned) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Message pinned!');
    } else {
      Alert.alert('Success', 'Message unpinned');
    }
  };

  const handleReplyToMessage = (message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReplyToMsg(message);
    setShowActionSheet(false);
    setSelectedMessage(null);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const bumpToBottom = async (message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const messageRef = doc(db, 'chats', chatId, 'messages', message.id);
    await updateDoc(messageRef, {
      bumpedAt: new Date(),
      bumped: true,
    });
    setShowActionSheet(false);
    setSelectedMessage(null);
    Alert.alert('Success', 'Message bumped to bottom!');
    
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const cancelReply = () => {
    setReplyToMsg(null);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setEditText('');
  };

  const showMessageActions = (message) => {
    setSelectedMessage(message);
    setShowActionSheet(true);
  };

  const handleImagePress = (imageUrl) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedImageUrl(imageUrl);
    setShowImageViewer(true);
  };

  // Swipeable right actions (Delete/Reply)
  const renderRightActions = (message) => {
    return (
      <View style={styles.rightActionsContainer}>
        <TouchableOpacity 
          style={[styles.swipeAction, styles.replySwipeAction]} 
          onPress={() => {
            handleReplyToMessage(message);
            if (swipeableRefs.current[message.id]) {
              swipeableRefs.current[message.id].close();
            }
          }}
        >
          <Ionicons name="return-up-back" size={24} color="#fff" />
          <Text style={styles.swipeActionText}>Reply</Text>
        </TouchableOpacity>
        {message.userId === auth.currentUser?.uid && (
          <TouchableOpacity 
            style={[styles.swipeAction, styles.deleteSwipeAction]} 
            onPress={() => {
              deleteMessage(message);
              if (swipeableRefs.current[message.id]) {
                swipeableRefs.current[message.id].close();
              }
            }}
          >
            <Ionicons name="trash" size={24} color="#fff" />
            <Text style={styles.swipeActionText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const pinnedMessages = messages.filter(msg => msg.isPinned);

  const renderPinnedMessagesModal = () => {
    return (
      <Modal
        visible={showPinnedMessages}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPinnedMessages(false)}
      >
        <View style={styles.pinnedModalContainer}>
          <View style={styles.pinnedModalContent}>
            <View style={styles.pinnedModalHeader}>
              <Text style={styles.pinnedModalTitle}>
                📌 Pinned Messages ({pinnedMessages.length})
              </Text>
              <TouchableOpacity onPress={() => setShowPinnedMessages(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {pinnedMessages.length === 0 ? (
              <View style={styles.noPinnedContainer}>
                <Ionicons name="pin-outline" size={50} color="#666" />
                <Text style={styles.noPinnedText}>No pinned messages yet</Text>
                <Text style={styles.noPinnedSubtext}>
                  Long press on a message and select "Pin" to save important messages here
                </Text>
              </View>
            ) : (
              <FlatList
                data={pinnedMessages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isMyMessage = item.userId === auth.currentUser?.uid;
                  return (
                    <TouchableOpacity 
                      style={styles.pinnedMessageItem}
                      onPress={() => {
                        setShowPinnedMessages(false);
                        const index = messages.findIndex(msg => msg.id === item.id);
                        if (index !== -1 && flatListRef.current) {
                          flatListRef.current.scrollToIndex({ index, animated: true });
                        }
                      }}
                    >
                      <View style={styles.pinnedMessageAvatar}>
                        {isMyMessage ? (
                          <View style={styles.pinnedMyAvatar}>
                            <Ionicons name="person" size={20} color="#121212" />
                          </View>
                        ) : (
                          <View style={styles.pinnedFriendAvatar}>
                            <Text style={styles.pinnedAvatarText}>
                              {friend?.username?.[0]?.toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      
                      <View style={styles.pinnedMessageContent}>
                        <View style={styles.pinnedMessageHeader}>
                          <Text style={styles.pinnedMessageSender}>
                            {isMyMessage ? 'You' : friend.username}
                          </Text>
                          <Text style={styles.pinnedMessageTime}>
                            {new Date(item.createdAt).toLocaleString()}
                          </Text>
                        </View>
                        
                        {item.replyTo && (
                          <View style={styles.pinnedReplyPreview}>
                            <Ionicons name="return-up-back" size={12} color="#888" />
                            <Text style={styles.pinnedReplyText} numberOfLines={1}>
                              Replying to {item.replyTo.userName}: {item.replyTo.text || '📷 Image'}
                            </Text>
                          </View>
                        )}
                        
                        {item.imageBase64 ? (
                          <View style={styles.pinnedImageContainer}>
                            <ExpoImage 
                              source={{ uri: item.imageBase64 }} 
                              style={styles.pinnedMessageImage}
                              contentFit="cover"
                              transition={300}
                            />
                            <Text style={styles.pinnedImageLabel}>📷 Image</Text>
                          </View>
                        ) : item.imageUrl ? (
                          <View style={styles.pinnedImageContainer}>
                            <ExpoImage 
                              source={{ uri: item.imageUrl }} 
                              style={styles.pinnedMessageImage}
                              contentFit="cover"
                              transition={300}
                            />
                            <Text style={styles.pinnedImageLabel}>📷 Image</Text>
                          </View>
                        ) : item.voiceBase64 ? (
                          <View style={styles.pinnedVoiceContainer}>
                            <Ionicons name="mic" size={20} color="#4CD964" />
                            <Text style={styles.pinnedVoiceText}>Voice Message</Text>
                          </View>
                        ) : (
                          <Text style={styles.pinnedMessageFullText}>
                            {item.text}
                            {item.edited && <Text style={styles.pinnedEditedText}> (edited)</Text>}
                          </Text>
                        )}
                        
                        {item.reaction && (
                          <View style={styles.pinnedReactionBadge}>
                            <Text style={styles.pinnedReactionText}>Reaction: {item.reaction}</Text>
                          </View>
                        )}
                      </View>
                      
                      <TouchableOpacity 
                        onPress={async () => {
                          const messageRef = doc(db, 'chats', chatId, 'messages', item.id);
                          await updateDoc(messageRef, {
                            isPinned: false,
                            pinnedAt: null,
                          });
                          Alert.alert('Unpinned', 'Message removed from pinned');
                        }}
                        style={styles.unpinButton}
                      >
                        <Ionicons name="pin-outline" size={22} color="#FF9800" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
                contentContainerStyle={styles.pinnedListContent}
              />
            )}
          </View>
        </View>
      </Modal>
    );
  };

  const renderReplyPreview = () => {
    if (!replyToMsg) return null;
    
    return (
      <View style={styles.replyPreview}>
        <View style={styles.replyPreviewContent}>
          <Ionicons name="return-up-back" size={16} color="#4CD964" />
          <View style={styles.replyPreviewText}>
            <Text style={styles.replyPreviewName}>{replyToMsg.userName}</Text>
            <Text style={styles.replyPreviewMessage} numberOfLines={1}>
              {replyToMsg.text || (replyToMsg.imageBase64 ? '📷 Image' : replyToMsg.voiceBase64 ? '🎤 Voice message' : '')}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={cancelReply} style={styles.replyPreviewCancel}>
          <Ionicons name="close" size={20} color="#888" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderEditInput = () => {
    if (!editingMessage) return null;
    
    return (
      <View style={styles.editContainer}>
        <View style={styles.editPreview}>
          <Text style={styles.editPreviewText}>Editing message</Text>
          <TouchableOpacity onPress={cancelEdit}>
            <Ionicons name="close" size={20} color="#888" />
          </TouchableOpacity>
        </View>
        <View style={styles.editInputContainer}>
          <TextInput
            style={styles.editInput}
            value={editText}
            onChangeText={setEditText}
            multiline
            autoFocus
            placeholderTextColor="#666"
          />
          <TouchableOpacity onPress={saveEditMessage} style={styles.editSaveButton}>
            <Ionicons name="checkmark" size={24} color="#4CD964" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Animated Read Receipts Component
  const AnimatedCheckmark = ({ seen }) => {
    const scale = useRef(new Animated.Value(0)).current;
    
    useEffect(() => {
      if (seen) {
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }).start();
      }
    }, [seen]);
    
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name="checkmark-done" size={14} color="#4CD964" />
      </Animated.View>
    );
  };

  const renderMessage = ({ item }) => {
    const isMyMessage = item.userId === auth.currentUser?.uid;
    const isFirstUnread = showNewMessageDivider && item.id === firstUnreadMessageId;
    const isPlayingThis = playingId === item.id;
    
    return (
      <Swipeable
        ref={ref => swipeableRefs.current[item.id] = ref}
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
      >
        <>
          {isFirstUnread && (
            <View style={styles.newMessageDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.newMessageText}>📩 New messages</Text>
              <View style={styles.dividerLine} />
            </View>
          )}
          
          <View style={[styles.messageRow, isMyMessage && styles.myMessageRow]}>
            {!isMyMessage && (
              <View style={styles.messageAvatarContainer}>
                {friend?.avatarUrl ? (
                  <ExpoImage 
                    source={{ uri: friend.avatarUrl }} 
                    style={styles.messageAvatar}
                    contentFit="cover"
                    transition={300}
                  />
                ) : (
                  <View style={styles.messageAvatarPlaceholder}>
                    <Text style={styles.messageAvatarText}>{friend?.username?.[0]?.toUpperCase()}</Text>
                  </View>
                )}
              </View>
            )}
            
            <TouchableOpacity 
              style={[styles.messageWrapper, isMyMessage && styles.myMessageWrapper]}
              onLongPress={() => showMessageActions(item)}
              activeOpacity={0.7}
              delayLongPress={300}
            >
              <View style={[
                styles.messageBubble, 
                isMyMessage && styles.myMessageBubble,
                item.isPinned && styles.pinnedMessageBubble
              ]}>
                {item.isPinned && (
                  <View style={styles.pinBadge}>
                    <Ionicons name="pin" size={12} color="#FF9800" />
                    <Text style={styles.pinText}>Pinned</Text>
                  </View>
                )}
                
                {item.bumped && !item.isPinned && (
                  <View style={styles.bumpBadge}>
                    <Ionicons name="arrow-down" size={10} color="#4CD964" />
                    <Text style={styles.bumpText}>Bumped</Text>
                  </View>
                )}
                
                {!isMyMessage && (
                  <Text style={styles.userName}>{item.userName}</Text>
                )}
                
                {item.replyTo && (
                  <View style={styles.replyToPreview}>
                    <Ionicons name="return-up-back" size={12} color="#888" />
                    <View style={styles.replyToContent}>
                      <Text style={styles.replyToName}>{item.replyTo.userName}</Text>
                      <Text style={styles.replyToText} numberOfLines={1}>
                        {item.replyTo.text || (item.replyTo.imageBase64 ? '📷 Image' : item.replyTo.voiceBase64 ? '🎤 Voice' : '')}
                      </Text>
                    </View>
                  </View>
                )}
                
                {/* Image Message */}
                {item.imageBase64 && (
                  <TouchableOpacity onPress={() => handleImagePress(item.imageBase64)}>
                    <ExpoImage 
                      source={{ uri: item.imageBase64 }} 
                      style={styles.messageImage}
                      contentFit="cover"
                      transition={300}
                    />
                  </TouchableOpacity>
                )}
                
                {/* Voice Message */}
                {item.voiceBase64 && (
                  <TouchableOpacity 
                    style={styles.voiceMessageContainer}
                    onPress={() => playVoiceMessage(item.voiceBase64, item.id)}
                  >
                    <Ionicons 
                      name={isPlayingThis ? "pause-circle" : "play-circle"} 
                      size={32} 
                      color={isMyMessage ? "#121212" : "#4CD964"} 
                    />
                    <View style={styles.voiceWaveform}>
                      <View style={[styles.waveBar, { height: 15 }]} />
                      <View style={[styles.waveBar, { height: 25 }]} />
                      <View style={[styles.waveBar, { height: 35 }]} />
                      <View style={[styles.waveBar, { height: 25 }]} />
                      <View style={[styles.waveBar, { height: 15 }]} />
                    </View>
                    <Text style={[styles.voiceText, isMyMessage && styles.myMessageText]}>
                      Voice message
                    </Text>
                  </TouchableOpacity>
                )}
                
                {/* Text Message */}
                {!item.imageBase64 && !item.voiceBase64 && (
                  <Text style={[styles.messageText, isMyMessage && styles.myMessageText]}>
                    {item.text}
                    {item.edited && <Text style={styles.editedText}> (edited)</Text>}
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
                    <AnimatedCheckmark seen={true} />
                  )}
                  {isMyMessage && !item.read && (
                    <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.5)" />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </>
      </Swipeable>
    );
  };

  // Image Viewer Modal
  const renderImageViewer = () => {
    if (!showImageViewer) return null;
    
    return (
      <Modal
        visible={showImageViewer}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageViewer(false)}
      >
        <View style={styles.imageViewerContainer}>
          <TouchableOpacity 
            style={styles.imageViewerClose}
            onPress={() => setShowImageViewer(false)}
          >
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          <ExpoImage 
            source={{ uri: selectedImageUrl }} 
            style={styles.fullScreenImage}
            contentFit="contain"
          />
        </View>
      </Modal>
    );
  };

  // Animated Typing Indicator Component
  const TypingIndicator = () => (
    <View style={styles.typingIndicatorContainer}>
      <View style={styles.typingIndicatorBubble}>
        <Animated.View style={[styles.typingDot, { transform: [{ scale: dot1 }] }]} />
        <Animated.View style={[styles.typingDot, { transform: [{ scale: dot2 }] }]} />
        <Animated.View style={[styles.typingDot, { transform: [{ scale: dot3 }] }]} />
      </View>
      <Text style={styles.typingIndicatorText}>{friend.username} is typing...</Text>
    </View>
  );

  // Recording Indicator (without stop button to prevent duplicate calls)
  const RecordingIndicator = () => (
    <View style={styles.recordingContainer}>
      <Animated.View style={[styles.recordingDot, { opacity: recordingAnimation }]} />
      <Text style={styles.recordingText}>Recording voice message...</Text>
      <Text style={styles.recordingHint}>Release mic to send</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#4CD964" />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          {friend?.avatarUrl ? (
            <ExpoImage 
              source={{ uri: friend.avatarUrl }} 
              style={styles.headerAvatar}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarText}>{friend?.username?.[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>{friend.username}</Text>
            {otherUserTyping && (
              <Text style={styles.typingStatus}>✍️ typing...</Text>
            )}
          </View>
        </View>
        
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={() => setShowPinnedMessages(true)} style={styles.pinListButton}>
            <Ionicons name="pin" size={22} color="#FF9800" />
            {pinnedMessages.length > 0 && (
              <View style={styles.pinBadgeCount}>
                <Text style={styles.pinBadgeCountText}>{pinnedMessages.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={showImageOptions} style={styles.imageButton}>
            <Ionicons name="image-outline" size={24} color="#4CD964" />
          </TouchableOpacity>
        </View>
      </View>

      {otherUserTyping && <TypingIndicator />}
      {isRecording && <RecordingIndicator />}

      {sendingImage && (
        <View style={styles.sendingContainer}>
          <ActivityIndicator size="small" color="#4CD964" />
          <Text style={styles.sendingText}>Sending media...</Text>
        </View>
      )}

      {renderReplyPreview()}
      {renderEditInput()}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => {
          if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
        onLayout={() => {
          if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
      />

      <View style={styles.inputContainer}>
        <TouchableOpacity 
          style={[styles.micButton, isRecording && styles.micButtonActive]} 
          onPressIn={startRecording}
          onPressOut={() => {
            // Only stop if we're actually recording
            if (isRecording && recording) {
              stopRecording();
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="mic" size={24} color={isRecording ? "#FF3B30" : "#4CD964"} />
        </TouchableOpacity>
        
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={newMessage}
          onChangeText={handleTyping}
          placeholder={replyToMsg ? `Reply to ${replyToMsg.userName}...` : "Type a message..."}
          placeholderTextColor="#888"
          multiline
        />
        
        <Animated.View style={{ transform: [{ scale: sendAnimation }] }}>
          <TouchableOpacity 
            style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]} 
            onPress={handleSendMessage}
            disabled={!newMessage.trim()}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Message Actions Modal */}
      <Modal
        visible={showActionSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionSheet(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowActionSheet(false)}
        >
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>Message Actions</Text>
            
            {selectedMessage?.userId === auth.currentUser?.uid && (
              <>
                <TouchableOpacity style={styles.actionItem} onPress={() => editMessage(selectedMessage)}>
                  <Ionicons name="create-outline" size={24} color="#4CD964" />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.actionItem} onPress={() => deleteMessage(selectedMessage)}>
                  <Ionicons name="trash-outline" size={24} color="#FF6B6B" />
                  <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
            
            <TouchableOpacity style={styles.actionItem} onPress={() => handleReplyToMessage(selectedMessage)}>
              <Ionicons name="return-up-back-outline" size={24} color="#4CD964" />
              <Text style={styles.actionText}>Reply</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionItem} onPress={() => togglePinMessage(selectedMessage)}>
              <Ionicons name="pin-outline" size={24} color="#FF9800" />
              <Text style={styles.actionText}>
                {selectedMessage?.isPinned ? 'Unpin' : 'Pin'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionItem} onPress={() => bumpToBottom(selectedMessage)}>
              <Ionicons name="arrow-down-outline" size={24} color="#4CD964" />
              <Text style={styles.actionText}>Bump to Bottom</Text>
            </TouchableOpacity>
            
            <View style={styles.actionDivider} />
            
            <TouchableOpacity style={styles.actionItem} onPress={() => setShowActionSheet(false)}>
              <Ionicons name="close-outline" size={24} color="#888" />
              <Text style={styles.actionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Reaction Modal */}
      <Modal
        visible={!!selectedMessage && !showActionSheet}
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

      {renderPinnedMessagesModal()}
      {renderImageViewer()}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backButton: {
    padding: 6,
    marginLeft: -6,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pinListButton: {
    padding: 6,
    position: 'relative',
  },
  pinBadgeCount: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF9800',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  pinBadgeCountText: {
    color: '#121212',
    fontSize: 10,
    fontWeight: 'bold',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  headerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CD964',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerAvatarText: {
    fontSize: 16,
    color: '#121212',
    fontWeight: 'bold',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  typingStatus: {
    fontSize: 10,
    color: '#4CD964',
    fontStyle: 'italic',
    marginTop: 2,
  },
  imageButton: {
    padding: 6,
    marginRight: -6,
  },
  typingIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  typingIndicatorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CD964',
    marginHorizontal: 3,
  },
  typingIndicatorText: {
    fontSize: 12,
    color: '#AAAAAA',
    fontStyle: 'italic',
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    gap: 12,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
  },
  recordingText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '500',
  },
  stopRecordingButton: {
    padding: 4,
  },
  sendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  sendingText: {
    fontSize: 12,
    color: '#AAAAAA',
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
    backgroundColor: '#4CD964',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageAvatarText: {
    fontSize: 14,
    color: '#121212',
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
    backgroundColor: '#2C2C2C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 1,
  },
  myMessageBubble: {
    backgroundColor: '#4CD964',
  },
  pinnedMessageBubble: {
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  pinText: {
    fontSize: 10,
    color: '#FF9800',
    fontWeight: '600',
  },
  bumpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  bumpText: {
    fontSize: 10,
    color: '#4CD964',
    fontWeight: '600',
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CD964',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  myMessageText: {
    color: '#121212',
  },
  editedText: {
    fontSize: 10,
    color: '#AAAAAA',
    fontStyle: 'italic',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginVertical: 4,
  },
  voiceMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  voiceWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveBar: {
    width: 3,
    backgroundColor: '#4CD964',
    borderRadius: 2,
  },
  voiceText: {
    fontSize: 14,
    color: '#FFFFFF',
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
    color: '#AAAAAA',
  },
  myTimeText: {
    color: 'rgba(18, 18, 18, 0.7)',
  },
  reactionBadge: {
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  newMessageDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#4CD964',
    opacity: 0.3,
  },
  newMessageText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: '#4CD964',
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#1E1E1E',
    borderTopWidth: 1,
    borderTopColor: '#333333',
    alignItems: 'flex-end',
    gap: 8,
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2C2C2C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonActive: {
    backgroundColor: '#3A3A3C',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    backgroundColor: '#2C2C2C',
    color: '#FFFFFF',
  },
  sendButton: {
    backgroundColor: '#4CD964',
    borderRadius: 20,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#333333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#2C2C2C',
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
  actionSheet: {
    backgroundColor: '#2C2C2C',
    borderRadius: 14,
    padding: 16,
    width: '85%',
    maxWidth: 300,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#444444',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  deleteText: {
    color: '#FF6B6B',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#444444',
    marginVertical: 8,
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2C2C2C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  replyPreviewContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  replyPreviewText: {
    flex: 1,
  },
  replyPreviewName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CD964',
  },
  replyPreviewMessage: {
    fontSize: 12,
    color: '#AAAAAA',
  },
  replyPreviewCancel: {
    padding: 4,
  },
  replyToPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 6,
    borderRadius: 8,
    marginBottom: 6,
    gap: 6,
  },
  replyToContent: {
    flex: 1,
  },
  replyToName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4CD964',
  },
  replyToText: {
    fontSize: 11,
    color: '#AAAAAA',
  },
  editContainer: {
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    padding: 12,
  },
  editPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  editPreviewText: {
    fontSize: 12,
    color: '#4CD964',
    fontWeight: '500',
  },
  editInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4CD964',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: '#2C2C2C',
    color: '#FFFFFF',
  },
  editSaveButton: {
    padding: 8,
  },
  pinnedModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'flex-end',
  },
  pinnedModalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  pinnedModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  pinnedModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  pinnedListContent: {
    padding: 16,
  },
  pinnedMessageItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#2C2C2C',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#444444',
  },
  pinnedMessageAvatar: {
    marginRight: 12,
  },
  pinnedMyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CD964',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinnedFriendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF9800',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinnedAvatarText: {
    fontSize: 16,
    color: '#121212',
    fontWeight: 'bold',
  },
  pinnedMessageContent: {
    flex: 1,
  },
  pinnedMessageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  pinnedMessageSender: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  pinnedMessageTime: {
    fontSize: 10,
    color: '#888888',
  },
  pinnedMessageFullText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 8,
  },
  pinnedEditedText: {
    fontSize: 10,
    color: '#888',
    fontStyle: 'italic',
  },
  pinnedReplyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    gap: 6,
  },
  pinnedReplyText: {
    fontSize: 11,
    color: '#AAAAAA',
    flex: 1,
  },
  pinnedImageContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  pinnedMessageImage: {
    width: 150,
    height: 150,
    borderRadius: 12,
    marginBottom: 4,
  },
  pinnedImageLabel: {
    fontSize: 12,
    color: '#4CD964',
    marginTop: 4,
  },
  pinnedVoiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pinnedVoiceText: {
    fontSize: 13,
    color: '#4CD964',
  },
  pinnedReactionBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  pinnedReactionText: {
    fontSize: 11,
    color: '#FF9800',
  },
  unpinButton: {
    padding: 8,
  },
  noPinnedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  noPinnedText: {
    fontSize: 16,
    color: '#AAAAAA',
    marginTop: 12,
  },
  noPinnedSubtext: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
    marginTop: 8,
  },
  // Swipe Actions Styles
  rightActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    height: '100%',
    borderRadius: 12,
    marginLeft: 8,
  },
  replySwipeAction: {
    backgroundColor: '#4CD964',
  },
  deleteSwipeAction: {
    backgroundColor: '#FF3B30',
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  // Image Viewer Styles
  imageViewerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  fullScreenImage: {
    width: width,
    height: height,
  },
});
