import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { fetchUsersOdoo, createUserOdoo } from '@api/services/generalApi';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Toast from 'react-native-toast-message';
import { TextInput as FormInput } from '@components/common/TextInput';
import { COLORS } from '@constants/theme';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuthStore } from '@stores/auth';

const UsersScreen = ({ navigation }) => {
  const authUser = useAuthStore((s) => s.user);
  const [isAdmin, setIsAdmin] = useState(false);
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchUsersOdoo);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    login: '',
    password: '',
    email: '',
    phone: '',
  });
  const [errors, setErrors] = useState({});

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text }),
    500
  );

  const hasLoadedRef = useRef(false);
  const lastParamsRef = useRef({ searchText: '' });
  const hasAttemptedFetchRef = useRef(false);

  // Check admin status
  useEffect(() => {
    const checkAdmin = authUser?.uid === 2 || authUser?.is_admin === true || authUser?.is_superuser === true;
    setIsAdmin(checkAdmin);

    if (!checkAdmin) {
      Toast.show({
        type: 'error',
        text1: 'Access Denied',
        text2: 'Only administrators can access this feature',
      });
      setTimeout(() => navigation.goBack(), 2000);
    }
  }, [authUser, navigation]);

  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) return; // Don't fetch if not admin

      const paramsChanged = lastParamsRef.current.searchText !== searchText;

      if (!hasLoadedRef.current || paramsChanged) {
        hasAttemptedFetchRef.current = true;
        fetchData({ searchText });
        hasLoadedRef.current = true;
        lastParamsRef.current = { searchText };
      }
    }, [searchText, isAdmin])
  );

  const handleLoadMore = useCallback(() => {
    fetchMoreData({ searchText });
  }, [searchText, fetchMoreData]);

  const handleInputChange = (field, value) => {
    setNewUser(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!newUser.name.trim()) newErrors.name = 'Name is required';
    if (!newUser.login.trim()) newErrors.login = 'Login is required';
    if (!newUser.password.trim()) newErrors.password = 'Password is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateUser = async () => {
    if (!validateForm()) return;

    setCreating(true);
    try {
      const result = await createUserOdoo({
        name: newUser.name.trim(),
        login: newUser.login.trim(),
        password: newUser.password,
        email: newUser.email.trim(),
        phone: newUser.phone.trim(),
      });

      if (result.error) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: result.error.data?.message || 'Failed to create user',
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: 'User created successfully',
        });
        setShowCreateModal(false);
        setNewUser({ name: '', login: '', password: '', email: '', phone: '' });
        fetchData({ searchText });
      }
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to create user',
      });
    } finally {
      setCreating(false);
    }
  };

  const renderUserItem = useCallback(({ item }) => (
    <TouchableOpacity style={styles.userCard}>
      <View style={styles.userIcon}>
        <Icon name="person" size={24} color="#461c8aff" />
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userLogin}>@{item.login}</Text>
        {item.email ? <Text style={styles.userDetail}>{item.email}</Text> : null}
        {item.phone ? <Text style={styles.userDetail}>{item.phone}</Text> : null}
        <View style={[styles.statusBadge, item.active ? styles.activeBadge : styles.inactiveBadge]}>
          <Text style={styles.statusText}>{item.active ? 'Active' : 'Inactive'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  ), []);

  const keyExtractor = useCallback((item, index) => `user-${item.id || index}`, []);

  const renderEmptyState = useCallback(() => (
    <EmptyState
      imageSource={require('@assets/images/EmptyData/empty_data.png')}
      message="No users found"
    />
  ), []);

  const renderUsers = () => {
    if (loading && data.length === 0 && hasAttemptedFetchRef.current) {
      return null;
    }
    if (data.length === 0 && !loading && hasAttemptedFetchRef.current) {
      return renderEmptyState();
    }
    if (data.length > 0) {
      return (
        <FlashList
          data={data}
          renderItem={renderUserItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
          onEndReached={handleLoadMore}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          estimatedItemSize={120}
          removeClippedSubviews={true}
        />
      );
    }
    return null;
  };

  // Don't render main content if not admin
  if (!isAdmin) {
    return (
      <SafeAreaView>
        <NavigationHeader
          title="Users"
          onBackPress={() => navigation.goBack()}
        />
        <RoundedContainer>
          <View style={styles.accessDeniedContainer}>
            <Icon name="lock" size={64} color="#ccc" />
            <Text style={styles.accessDeniedText}>Access Denied</Text>
            <Text style={styles.accessDeniedSubtext}>
              Only administrators can access this feature
            </Text>
          </View>
        </RoundedContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Users"
        onBackPress={() => navigation.goBack()}
      />
      <SearchContainer
        placeholder="Search Users"
        onChangeText={handleSearchTextChange}
        value={searchText}
      />
      <RoundedContainer>
        {renderUsers()}
      </RoundedContainer>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Icon name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New User</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Icon name="close" size={24} color="#461c8aff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.formScrollView}
              contentContainerStyle={styles.formContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <FormInput
                label="Name *"
                placeholder="Enter full name"
                value={newUser.name}
                onChangeText={(text) => handleInputChange('name', text)}
                error={errors.name}
              />
              <FormInput
                label="Login *"
                placeholder="Enter username"
                value={newUser.login}
                onChangeText={(text) => handleInputChange('login', text)}
                error={errors.login}
                autoCapitalize="none"
              />
              <FormInput
                label="Password *"
                placeholder="Enter password"
                value={newUser.password}
                onChangeText={(text) => handleInputChange('password', text)}
                error={errors.password}
                secureTextEntry
              />
              <FormInput
                label="Email"
                placeholder="Enter email"
                value={newUser.email}
                onChangeText={(text) => handleInputChange('email', text)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <FormInput
                label="Phone"
                placeholder="Enter phone number"
                value={newUser.phone}
                onChangeText={(text) => handleInputChange('phone', text)}
                keyboardType="phone-pad"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.createButton]}
                onPress={handleCreateUser}
                disabled={creating}
              >
                <Text style={styles.createButtonText}>
                  {creating ? 'Creating...' : 'Create User'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  userIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f5f0ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d2d2d',
    marginBottom: 4,
  },
  userLogin: {
    fontSize: 14,
    color: '#461c8aff',
    marginBottom: 4,
    fontWeight: '600',
  },
  userDetail: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  activeBadge: {
    backgroundColor: '#e8f5e9',
  },
  inactiveBadge: {
    backgroundColor: '#ffebee',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#461c8aff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#461c8aff',
  },
  formScrollView: {
    flexGrow: 0,
    flexShrink: 1,
  },
  formContainer: {
    padding: 20,
    paddingBottom: 10,
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  createButton: {
    backgroundColor: '#461c8aff',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  accessDeniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  accessDeniedText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#666',
    marginTop: 20,
  },
  accessDeniedSubtext: {
    fontSize: 16,
    color: '#999',
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

export default UsersScreen;
