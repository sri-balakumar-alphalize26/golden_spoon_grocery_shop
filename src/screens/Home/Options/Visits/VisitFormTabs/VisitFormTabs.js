import { useWindowDimensions } from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useState, useEffect } from 'react';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { CustomTabBar } from '@components/TabBar';
import Customer from './Customer';
import VisitDetails from './VisitDetails';
import InAndOut from './InAndOut';
import { fetchPipelineDetails, fetchVisitPlanDetails } from '@api/details/detailApi';
import * as Location from 'expo-location';
import { OverlayLoader } from '@components/Loader';
import { useAuthStore } from '@stores/auth';
import { validateFields } from '@utils/validation';
import { showToast } from '@utils/common';
import { post } from '@api/services/utils';
import { Keyboard } from 'react-native';


const VisitFormTabs = ({ navigation, route }) => {

    const layout = useWindowDimensions();
    const [index, setIndex] = useState(0);
    const [routes] = useState([
        { key: 'first', title: 'Customer' },
        { key: 'second', title: 'Visit Details' },
        { key: 'third', title: 'In & OUt' },
    ]);
    // get visitplan id or pipeline id in visit form 
    const { visitPlanId = "", pipelineId = "" } = route?.params || {};
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    const currentUser = useAuthStore(state => state.user)
    const [formData, setFormData] = useState({
        customer: '',
        employee: { id: currentUser.related_profile?._id || '', label: currentUser?.related_profile?.name },
        siteLocation: '',
        dateAndTime: new Date(),
        nextVisitDate: null,
        contactPerson: '',
        visitPurpose: '',
        remarks: '',
        longitude: null,
        latitude: null,
        timeIn: null,
        timeOut: null,
        imageUrls: [],
    })

    // fetch visit plan details visit plan id is available ie. means navigating through visit plan 
    const fetchVisitPlan = async () => {
        setIsLoading(true);
        try {
            const [detail] = await fetchVisitPlanDetails(visitPlanId);
            console.log("🚀 ~ file: VisitFormTabs.js:43 ~ fetchVisitPlan ~ detail:", JSON.stringify(detail, null, 3))
            setFormData(prev => ({
                ...prev,
                customer: {
                    id: detail?.customer_id || '',
                    label: detail?.customer_name?.trim() || ''
                },
                employee: {
                    id: detail?.visit_employee_id || '',
                    label: detail?.visit_employee_name?.trim() || ''
                },
                dateAndTime: detail?.visit_date || '',
                visitPurpose: {
                    id: detail?.purpose_of_visit_id || '',
                    label: detail?.purpose_of_visit_name
                },
                remarks: detail?.remarks || '',
            }));
        } catch (error) {
            console.error('Error fetching visit plan details:', error);
            showToast({ type: 'error', title: 'Error', message: 'Failed to fetch visit plan details. Please try again.' });
        } finally {
            setIsLoading(false);
        }
    };

    // fetch visit plan details pipeline id is available ie. means navigating through visit plan 
    const fetchPipeline = async () => {
        setIsLoading(true);
        try {
            const [detail] = await fetchPipelineDetails(pipelineId);
            setFormData(prev => ({
                ...prev,
                customer: {
                    id: detail?.customer?.customer_id || '',
                    label: detail?.customer?.name?.trim() || ''
                },
                remarks: detail?.remarks || '',
            }));
        } catch (error) {
            console.error('Error fetching pipeline details:', error);
            showToast({ type: 'error', title: 'Error', message: 'Failed to fetch pipeline details. Please try again.' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (visitPlanId) {
            fetchVisitPlan(visitPlanId);
        } else if (pipelineId) {
            fetchPipeline(pipelineId)
        }
    }, [visitPlanId, pipelineId])

    useEffect(() => {
        (async () => {
            // Request permission to access location
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.log('Permission to access location was denied');
                return;
            }

            // Get current location
            let location = await Location.getCurrentPositionAsync({});
            setFormData(prev => ({
                ...prev,
                longitude: location.coords.longitude,
                latitude: location.coords.latitude,
            }));
        })();
    }, []);


    const handleFieldChange = (field, value) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));
        if (errors[field]) {
            setErrors((prevErrors) => ({
                ...prevErrors,
                [field]: null,
            }));
        }
    };

    const handleTabChange = (nextIndex) => {
        setIndex(nextIndex);
    };
    const renderScene = ({ route }) => {
        switch (route.key) {
            case 'first':
                return <Customer handleFieldChange={handleFieldChange} formData={formData} errors={errors} onNextPress={() => handleTabChange(1)} />;
            case 'second':
                return <VisitDetails handleFieldChange={handleFieldChange} formData={formData} errors={errors} onNextPress={() => handleTabChange(2)} />;
            case 'third':
                return <InAndOut handleFieldChange={handleFieldChange} formData={formData} errors={errors} submit={submit} loading={isSubmitting} />;
            default:
                return null;
        }
    };


    const validateForm = (fieldsToValidate) => {
        Keyboard.dismiss();
        const { isValid, errors } = validateFields(formData, fieldsToValidate);
        setErrors(errors);
        return isValid;
    };

    const submit = async () => {
        const fieldsToValidate = ['employee', 'customer', 'dateAndTime', 'remarks', 'visitPurpose', 'timeIn', 'timeOut'];
        if (validateForm(fieldsToValidate)) {
            setIsSubmitting(true);
            const visitData = {
                employee_id: formData.employee?.id || '',
                date_time: formData?.dateAndTime || null,
                customer_id: formData?.customer?.id,
                contact_no: formData?.contactPerson?.contactNo || null,
                images: formData.imageUrls || null,
                purpose_of_visit_id: formData?.visitPurpose?.id || null,
                remarks: formData?.remarks || null,
                next_customer_visit_date: formData.nextVisitDate || null,
                site_location_id: formData?.siteLocation?.id || null,
                contact_person_id: formData?.contactPerson?.id || null,
                longitude: formData?.longitude || null,
                latitude: formData?.latitude || null,
                pipeline_id: pipelineId || null,
                visit_plan_id: visitPlanId || null,
                time_in: formData.timeIn || null,
                time_out: formData.timeOut || null
            };
            // console.log("🚀 ~ submit ~ visitData:", JSON.stringify(visitData, null, 2))
            try {
                const response = await post("/createCustomerVisitList", visitData);
                if (response.success) {
                    showToast({
                        type: "success",
                        title: "Success",
                        message: response.message || "Customer Visit created successfully",
                    });
                    navigation.goBack();
                } else {
                    console.error("Customer Visit Failed:", response.message);
                    showToast({
                        type: "error",
                        title: "ERROR",
                        message: response.message || "Customer Visit creation failed",
                    });
                }
            } catch (error) {
                console.error("Error creating Customer Visit Failed:", error);
                showToast({
                    type: "error",
                    title: "ERROR",
                    message: "An unexpected error occurred. Please try again later.",
                });
            } finally {
                setIsSubmitting(false);
            }
        }
    };


    return (
        <SafeAreaView>
            <NavigationHeader
                title="New Customer Visit"
                onBackPress={() => navigation.goBack()}
            />
            <TabView
                navigationState={{ index, routes }}
                renderScene={renderScene}
                renderTabBar={props => <CustomTabBar {...props} scrollEnabled={false}/>}
                onIndexChange={setIndex}
                initialLayout={{ width: layout.width }}
            />
            {/* <Button onPress={submit}/> */}
            <OverlayLoader visible={isLoading || isSubmitting} />
        </SafeAreaView>
    );
};

export default VisitFormTabs;
