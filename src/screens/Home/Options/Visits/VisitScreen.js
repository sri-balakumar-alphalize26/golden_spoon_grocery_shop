import React, { useState, useEffect, useCallback } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { FABButton, LoadingButton, PressableInput } from '@components/common/Button';
import { fetchCustomerVisitList } from '@api/services/generalApi';
import { useDataFetching } from '@hooks';
import AnimatedLoader from '@components/Loader/AnimatedLoader';
import Text from '@components/Text';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { FontAwesome } from '@expo/vector-icons';
import { fetchBrandsDropdown, fetchCustomersDropdown, fetchDepartmentsDropdown, fetchEmployeesDropdown } from '@api/dropdowns/dropdownApi';
import { DropdownSheet, MultiSelectDropdownSheet } from '@components/common/BottomSheets';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import moment from 'moment';
import { filterCalendar } from '@constants/dropdownConst';
import { useAuthStore } from '@stores/auth';
import { VisitList } from '@components/CRM';

const VisitScreen = ({ navigation }) => {
  const isFocused = useIsFocused();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?.related_profile?._id || '';
  const [selectedType, setSelectedType] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState('from');

  const [formData, setFormData] = useState({
    fromDate: '',
    toDate: '',
    customer: '',
    employees: [],
    departments: [],
    brands: []
  });

  const [dropdown, setDropdown] = useState({
    employees: [],
    departments: [],
    brands: [],
    customers: '',
  });

  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchCustomerVisitList);

  useFocusEffect(
    useCallback(() => {
      fetchData({ loginEmployeeId: currentUserId });
    }, [currentUserId])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData({ loginEmployeeId: currentUserId });
    }
  }, [isFocused]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const employeeDropdown = await fetchEmployeesDropdown();
        const departmentsDropdown = await fetchDepartmentsDropdown();
        const brandsDropdown = await fetchBrandsDropdown();
        const customersDropdown = await fetchCustomersDropdown();
        setDropdown({
          employees: employeeDropdown.map((data) => ({
            id: data._id,
            label: data.name,
          })),
          departments: departmentsDropdown.map((data) => ({
            id: data._id,
            label: data.department_name,
          })),
          brands: brandsDropdown.map((data) => ({
            id: data._id,
            label: data.brand_name,
          })),
          customers: customersDropdown.map((data) => ({
            id: data._id,
            label: data.name,
          })),
        });
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
      }
    };

    fetchData();
  }, []);

  const handleLoadMore = () => {
    fetchMoreData({ loginEmployeeId: currentUserId });
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    const { longitude, latitude, date_time, customer, site_location, customer_contact, purpose_of_visit, remarks, _id } = item;
    const details = { longitude, latitude, date_time, customer, site_location, customer_contact, purpose_of_visit, remarks, _id };
    return <VisitList item={item} onPress={() => navigation.navigate('VisitDetails', { visitDetails: details })} />;
  };

  const renderEmptyState = () => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty_data.png')} message={'no visits found'} />
  );

  const renderContent = () => (
    <FlashList
      data={formatData(data, 1)}
      numColumns={1}
      renderItem={renderItem}
      keyExtractor={(item, index) => index.toString()}
      contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.2}
      ListFooterComponent={
        loading && (
          <AnimatedLoader
            visible={loading}
            animationSource={require('@assets/animations/loading.json')}
          />
        )
      }
      estimatedItemSize={100}
    />
  );

  const renderListing = () => {
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const handleFieldChange = (fieldName, value) => {
    setFormData((prevState) => ({
      ...prevState,
      [fieldName]: value,
    }));
  };

  const handleDateConfirm = (date) => {
    const formattedDate = moment(date).format('DD-MM-YYYY');
    if (datePickerMode === 'from') {
      handleFieldChange('fromDate', formattedDate);
    } else {
      handleFieldChange('toDate', formattedDate);
    }
    setDatePickerVisibility(false);
  };


  const handleDateRangeSelection = (rangeType) => {
    let fromDate = moment();
    let toDate = moment();

    switch (rangeType.value) {
      case 'Yesterday':
        fromDate = fromDate.subtract(1, 'days');
        toDate = toDate.subtract(1, 'days');
        break;
      case 'Today':
        break;
      case 'Tomorrow':
        fromDate = fromDate.add(1, 'days');
        toDate = toDate.add(1, 'days');
        break;
      case 'This Month':
        fromDate = fromDate.startOf('month');
        toDate = toDate.endOf('month');
        break;
      case 'Last Month':
        fromDate = fromDate.subtract(1, 'months').startOf('month');
        toDate = toDate.subtract(1, 'months').endOf('month');
        break;
      case 'This Year':
        fromDate = fromDate.startOf('year');
        toDate = toDate.endOf('year');
        break;
      default:
        return;
    }

    handleFieldChange('fromDate', fromDate.format('DD-MM-YYYY'));
    handleFieldChange('toDate', toDate.format('DD-MM-YYYY'));
    setIsVisible(false);
  };

  const renderBottomSheet = () => {
    let items = [];
    let isMultiSelect = true;
    let previousSelections = [];

    switch (selectedType) {
      case 'Employees':
        items = dropdown.employees;
        previousSelections = formData.employees;
        break;
      case 'Departments':
        items = dropdown.departments;
        previousSelections = formData.departments;
        break;
      case 'Brands':
        items = dropdown.brands;
        previousSelections = formData.brands;
        break;
      case 'Customer':
        items = dropdown.customers;
        // previousSelections = formData.customer ? [formData.customer] : [];
        isMultiSelect = false;
        break;
      case 'Select Durations':
        items = filterCalendar;
        isMultiSelect = false;
        break;
      default:
        return null;
    }

    return isMultiSelect ? (
      <MultiSelectDropdownSheet
        isVisible={isVisible}
        items={items}
        title={selectedType}
        onClose={() => setIsVisible(false)}
        onValueChange={(value) => handleFieldChange(selectedType.toLowerCase(), value)}
        previousSelections={previousSelections}  // Pass previous selections
      />
    ) : (
      <DropdownSheet
        isVisible={isVisible}
        items={items}
        title={selectedType}
        onClose={() => setIsVisible(false)}
        onValueChange={(value) => {
          if (selectedType === 'Select Durations') {
            handleDateRangeSelection(value);
          } else {
            handleFieldChange('customer', value);
          }
        }}
      />
    );
  };


  const applyFilters = () => {
    fetchData({
      fromDate: formData.fromDate,
      toDate: formData.toDate,
      customerId: formData.customer ? formData.customer.id : '',
      loginEmployeeId: currentUserId
    })
    fetchMoreData({
      fromDate: formData.fromDate,
      toDate: formData.toDate,
      customerId: formData.customer ? formData.customer.id : '',
      loginEmployeeId: currentUserId
    })
  }

  const clearFilters = () => {
    setFormData({
      fromDate: '',
      toDate: '',
      customer: '',
      employees: [],
      departments: [],
      brands: [],
    });
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Customer Visits"
        logo={false}
        refreshPress={clearFilters}
        refreshIcon
        onBackPress={() => navigation.goBack()}
      />
      <View style={{ paddingHorizontal: 25, marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 }}>
          <Text style={styles.label} >From</Text>
          <PressableInput
            placeholder='From Date'
            value={formData.fromDate}
            handlePress={() => {
              setDatePickerMode('from');
              setDatePickerVisibility(true);
            }}
          />
          <View style={{ width: 10 }} />
          <Text style={styles.label}>To</Text>
          <PressableInput
            placeholder='To Date'
            value={formData.toDate}
            handlePress={() => {
              setDatePickerMode('to');
              setDatePickerVisibility(true);
            }}
          />
          <View style={{ width: 10 }} />
          <TouchableOpacity onPress={() => toggleBottomSheet('Select Durations')}>
            <FontAwesome name="calendar" size={28} color="white" />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingBottom: 8 }}>
          <PressableInput
            placeholder='Employee'
            dropIcon={"menu-down"}
            value={formData.employees[0]?.label}
            // multiline={true}
            handlePress={() => toggleBottomSheet('Employees')}
          />
          <View style={{ width: 3 }} />
          <PressableInput
            placeholder='Departments'
            dropIcon={"menu-down"}
            value={formData.departments[0]?.label}
            handlePress={() => toggleBottomSheet('Departments')}
          />
          <View style={{ width: 3 }} />
          <PressableInput
            placeholder='Brands'
            dropIcon={"menu-down"}
            value={formData.brands[0]?.label}
            handlePress={() => toggleBottomSheet('Brands')}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.label} >Customers</Text>
          <View style={{ width: 3 }} />
          <PressableInput
            placeholder='Select Customer'
            dropIcon={"menu-down"}
            value={formData.customer?.label}
            handlePress={() => toggleBottomSheet('Customer')}
          />
          <View style={{ width: 3 }} />
          <LoadingButton
            width={100}
            onPress={applyFilters}
            marginVertical={0}
            height={35}
            borderRadius={6}
            title='Apply'
          />
        </View>
      </View>
      <RoundedContainer>
        {renderBottomSheet()}
        {renderListing()}
        <FABButton onPress={() => navigation.navigate('VisitForm')} />
      </RoundedContainer>
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={handleDateConfirm}
        onCancel={() => setDatePickerVisibility(false)}
      />
    </SafeAreaView>
  );
};

export default VisitScreen;

const styles = StyleSheet.create({
  label: {
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.white,
    marginRight: 10
  }
});
