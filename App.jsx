import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ActivityIndicator, View, StatusBar, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { auth, db } from './config/firebase';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import HomeScreen from './screens/HomeScreen';
import ChatScreen from './screens/ChatScreen';
import FriendRequestsScreen from './screens/FriendRequestsScreen';
import ProfileScreen from './screens/ProfileScreen';
import CreateGroupScreen from './screens/CreateGroupScreen';
import BlockedUsersScreen from './screens/BlockedUsersScreen';
import AddMemberScreen from './screens/AddMemberScreen';

const Stack = createStackNavigator();

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const previousUserRef = useRef(null);

  const setUserOnline = async (userId) => {
    if (!userId) return;
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { online: true, lastSeen: serverTimestamp() }, { merge: true });
  };

  const setUserOffline = async (userId) => {
    if (!userId) return;
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { online: false, lastSeen: serverTimestamp() });
  };

  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        await setUserOnline(currentUser.uid);
      } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        await setUserOffline(currentUser.uid);
      }
      appState.current = nextAppState;
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (previousUserRef.current && !currentUser) {
        await setUserOffline(previousUserRef.current.uid);
      }
      setUser(currentUser);
      if (currentUser) {
        await setUserOnline(currentUser.uid);
        previousUserRef.current = currentUser;
      } else {
        previousUserRef.current = null;
      }
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  if (loading) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
          <StatusBar barStyle="light-content" backgroundColor="#000000" translucent={false} />
          <ActivityIndicator size="large" color="#4CD964" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" translucent={false} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            <React.Fragment>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="Chat" component={ChatScreen} />
              <Stack.Screen name="GroupChat" component={ChatScreen} />
              <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
              <Stack.Screen name="FriendRequests" component={FriendRequestsScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
              <Stack.Screen name="AddMember" component={AddMemberScreen} />
            </React.Fragment>
          ) : (
            <React.Fragment>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Signup" component={SignupScreen} />
            </React.Fragment>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
};

export default App;