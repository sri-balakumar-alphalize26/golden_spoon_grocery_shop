import React, { useEffect, useState } from 'react';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { fetchProductsDropdown, fetchUnitOfMeasureDropdown, fetchTaxDropdown } from '@api/dropdowns/dropdownApi';
import { DropdownSheet } from '@components/common/BottomSheets';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { Keyboard } from 'react-native';
import { validateFields } from '@utils/validation';
import { CheckBox } from '@components/common/CheckBox';
import { showToastMessage } from '@components/Toast';

const AddSpareParts = ({ navigation, route }) => {
    const { id, addSpareParts } = route?.params || {};
    const [selectedType, setSelectedType] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const [searchText, setSearchText] = useState('');

    const [dropdown, setDropdown] = useState({
        products: [],
        unitofmeasure: [],
        taxes: [],
    });

    const [formData, setFormData] = useState({
        product: '',
        description: '',
        quantity: '1',
        uom: '',
        unitPrice: '',
        isInclusive: false,
        tax: '',       // VAT 5% id and its label
        subTotal: '',
        taxType: ''
    });

    const [errors, setErrors] = useState({});

    const calculateSubTotal = (unitPrice, quantity, isInclusive) => {
        const subtotal = parseFloat(unitPrice) * parseFloat(quantity);

        if (isInclusive) {
            const tax = (subtotal / 1.05) * 0.05;
            return (subtotal - tax).toFixed(2);
        } else {
            return subtotal.toFixed(2);
        }
    };

    const handleQuantityChange = (value,) => {
        const spareTotalPrice = calculateSpareTotalPrice(formData.unitPrice, value, formData.isInclusive);
        const tax = calculateTax(formData.unitPrice, value, formData.isInclusive);
        const total = calculateTotal(spareTotalPrice, tax);

        setFormData(prevFormData => ({
            ...prevFormData,
            quantity: value,
            spareTotalPrice,
            tax,
            total,
        }));
    };

    const handleFieldChange = (field, value) => {
        let updatedFormData = { ...formData, [field]: value };

        if (field === 'unitPrice' || field === 'quantity') {
            const spareTotalPrice = calculateSpareTotalPrice(updatedFormData.unitPrice, updatedFormData.quantity, updatedFormData.isInclusive);
            const tax = calculateTax(updatedFormData.unitPrice, updatedFormData.quantity, updatedFormData.isInclusive);
            const total = calculateTotal(spareTotalPrice, tax);

            updatedFormData = {
                ...updatedFormData,
                subTotal: calculateSubTotal(updatedFormData.unitPrice, updatedFormData.quantity, tax, updatedFormData.isInclusive),
                spareTotalPrice,
                tax,
                total,
            };
        }

        setFormData(updatedFormData);

        if (errors[field]) {
            setErrors(prevErrors => ({
                ...prevErrors,
                [field]: null,
            }));
        }
    };

    const handleInclusiveChange = (isInclusive) => {
        const spareTotalPrice = calculateSpareTotalPrice(formData.unitPrice, formData.quantity, isInclusive);
        const tax = calculateTax(formData.unitPrice, formData.quantity, isInclusive);
        const total = calculateTotal(spareTotalPrice, tax);

        setFormData(prevFormData => ({
            ...prevFormData,
            isInclusive,
            spareTotalPrice,
            tax,
            total,
        }));
    };

    const calculateSpareTotalPrice = (unitPrice, quantity, isInclusive) => {
        const subtotal = parseFloat(unitPrice) * parseFloat(quantity);

        if (isInclusive) {
            const spareTotalWithoutTax = (subtotal / 1.05).toFixed(2);
            return spareTotalWithoutTax;
        } else {
            return subtotal.toFixed(2);
        }
    };

    const calculateTax = (unitPrice, quantity, isInclusive) => {
        const subtotal = parseFloat(unitPrice) * parseFloat(quantity);
        if (isInclusive) {
            return (subtotal - (subtotal / 1.05)).toFixed(2);
        } else {
            return (subtotal * 0.05).toFixed(2);
        }
    };

    const handleProductSelection = (selectedProduct) => {
        const unitPrice = selectedProduct.unitPrice ? selectedProduct.unitPrice.toString() : '0';
        const description = selectedProduct.productDescription || '';
        const defaultQuantity = "1";
        const initialSubTotal = (parseFloat(unitPrice) * parseFloat(defaultQuantity)).toFixed(2);
        const tax = calculateTax(initialSubTotal, defaultQuantity, formData.isInclusive);
        const total = calculateTotal(initialSubTotal, tax)
        const spareTotalPrice = initialSubTotal

        setFormData(prevFormData => ({
            ...prevFormData,
            product: selectedProduct,
            description,
            unitPrice,
            quantity: defaultQuantity,
            tax,
            spareTotalPrice,
            total,
        }));
    };

    const calculateTotal = (spareTotalPrice, tax,) => {
        return (parseFloat(spareTotalPrice) + parseFloat(tax)).toFixed(2);
    };

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const ProductsData = await fetchProductsDropdown(searchText);
                setDropdown(prevDropdown => ({
                    ...prevDropdown,
                    products: ProductsData?.map(data => ({
                        id: data._id,
                        label: data.product_name?.trim(),
                        unitPrice: data.sale_price,
                        productDescription: data.product_description,
                    })),
                }));
            } catch (error) {
                console.error('Error fetching Products dropdown data:', error);
            }
        };

        fetchProducts();
    }, [searchText]);

    useEffect(() => {
        const fetchUnitOfMeasure = async () => {
            try {
                const UnitOfMeasureData = await fetchUnitOfMeasureDropdown();
                const uomItems = UnitOfMeasureData.map(data => ({
                    id: data._id,
                    label: data.uom_name,
                }));

                const defaultUOM = uomItems.find(uom => uom.label === 'Pcs');
                setDropdown(prevDropdown => ({
                    ...prevDropdown,
                    unitofmeasure: uomItems,
                }));

                if (defaultUOM) {
                    setFormData(prevFormData => ({
                        ...prevFormData,
                        uom: defaultUOM,
                    }));
                }
            } catch (error) {
                console.error('Error fetching Unit Of Measure dropdown data:', error);
            }
        };

        fetchUnitOfMeasure();
    }, []);

    useEffect(() => {
        const fetchTax = async () => {
            try {
                const TaxData = await fetchTaxDropdown();
                const taxItems = TaxData.map(data => ({
                    id: data._id,
                    label: data.tax_type_name,
                }));

                const defaultTax = taxItems.find(tax => tax.label === "vat 5%");
                // console.log("Default Tax : ", defaultTax)
                // setDropdown(prevDropdown => ({
                //     ...prevDropdown,
                //     taxes: taxItems,
                // }));

                if (defaultTax) {
                    setFormData(prevFormData => ({
                        ...prevFormData,
                        taxType: defaultTax,
                    }));
                }
            } catch (error) {
                console.error('Error fetching Tax dropdown data:', error);
            }
        };

        fetchTax();
    }, []);

    const toggleBottomSheet = (type) => {
        setSelectedType(isVisible ? null : type);
        setIsVisible(!isVisible);
    };

    const validateForm = (fieldsToValidate) => {
        Keyboard.dismiss();
        const { isValid, errors } = validateFields(formData, fieldsToValidate);
        setErrors(errors);
        return isValid;
    };

    const handleAddItems = async () => {
        const fieldsToValidate = ['product', 'tax'];
        if (formData.quantity === '' || formData.quantity === undefined || formData.quantity === null) {
          showToastMessage('Quantity is required');
          return;
        }
        if (Number(formData.quantity) <= 0) {
          showToastMessage('Quantity should be greater than 0');
          return;
        }    
        if (validateForm(fieldsToValidate)) {
            const spareItem = {
                product: formData.product || '',
                description: formData.description || '',
                quantity: formData.quantity || '',
                uom: formData.uom || '',
                unitPrice: formData.unitPrice || '',
                tax: formData.tax || '',
                subTotal: formData.subTotal || '',
                spareTotalPrice: formData.spareTotalPrice || '',
                total: formData.total || '',
                taxType: formData.taxType || '',
            };
            console.log("Added Spares :", spareItem)
            addSpareParts(spareItem);
            navigation.navigate('QuickServiceUpdateDetails', { id });
        }
    };

    const renderBottomSheet = () => {
        let items = [];
        let fieldName = '';

        switch (selectedType) {
            case 'Spare Name':
                items = dropdown.products;
                fieldName = 'product';
                break;
            case 'UOM':
                items = dropdown.unitofmeasure;
                fieldName = 'uom';
                break;
            case 'Tax':
                items = dropdown.taxes;
                fieldName = 'tax';
                break;
            default:
                return null;
        }
        return (
            <DropdownSheet
              isVisible={isVisible}
              items={items}
              title={selectedType}
              onClose={() => setIsVisible(false)}
              search={selectedType === "Spare Name"}
              onSearchText={(value) => setSearchText(value)}
              onValueChange={(value) => {
                setSearchText('')
                if (selectedType === 'Spare Name') {
                  handleProductSelection(value);
                } else {
                  handleFieldChange(fieldName, value);
                }
              }}
            />
        );
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title="Add Spare Parts"
                onBackPress={() => navigation.goBack()}
            />
            <RoundedScrollContainer>
                <FormInput
                    label="Spare Name"
                    placeholder="Select Product Name"
                    dropIcon="menu-down"
                    multiline
                    required
                    editable={false}
                    validate={errors.product}
                    value={formData.product?.label?.trim()}
                    onPress={() => toggleBottomSheet('Spare Name')}
                />
                <FormInput
                    label="Description"
                    placeholder="Enter Description"
                    value={formData.description}
                    onChangeText={(value) => handleFieldChange('description', value)}
                />
                <FormInput
                    label="Quantity"
                    placeholder="Enter Quantity"
                    required
                    keyboardType="numeric"
                    value={formData.quantity}
                    onChangeText={(value) => handleQuantityChange(value)}
                />
                <FormInput
                    label="UOM"
                    placeholder="Unit Of Measure"
                    dropIcon="menu-down"
                    editable={false}
                    value={formData.uom?.label || 'Pcs'}
                />
                <FormInput
                    label="Unit Price"
                    placeholder="Enter Unit Price"
                    editable={false}
                    keyboardType="numeric"
                    value={formData.unitPrice}
                />
                <FormInput
                    label="Tax"
                    placeholder="Enter Tax"
                    // dropIcon="menu-down"
                    required
                    editable={false}
                    value={formData.taxType?.label || 'VAT 5%'}
                />
                <CheckBox
                    checked={formData.isInclusive}
                    onPress={() => handleInclusiveChange(!formData.isInclusive)}
                    label="Is Inclusive"
                />
                <FormInput
                    label="Spare Item Total"
                    editable={false}
                    value={formData.spareTotalPrice}
                />
                <FormInput
                    label="Spare Item Tax"
                    editable={false}
                    value={formData.tax}
                />
                <FormInput
                    label="Total"
                    editable={false}
                    value={formData.total}
                />
                <Button
                    title={'Add Item'}
                    alignSelf={'center'}
                    backgroundColor={COLORS.primaryThemeColor}
                    onPress={handleAddItems}
                />
                {renderBottomSheet()}
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

export default AddSpareParts;