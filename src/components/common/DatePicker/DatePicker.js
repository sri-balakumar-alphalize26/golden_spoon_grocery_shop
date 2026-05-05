import React, { useState } from "react";
import DateTimePickerModal from "react-native-modal-datetime-picker";

const DatePicker = ({ visible, onSelect, onCancel }) => {
    return (
        <DateTimePickerModal
            isVisible={visible}
            mode="date"
            onConfirm={onSelect}
            onCancel={onCancel}
            headerTextIOS="Pick a Date"
        />
    );
};

export default DatePicker;
