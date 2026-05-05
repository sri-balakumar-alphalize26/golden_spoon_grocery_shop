import { format } from 'date-fns';

const formatDateandTime = (date = new Date(), formatString = 'dd MMMM yyyy hh:mm a') => {
    return date ? format(new Date(date), formatString) : '';
};

export default formatDateandTime;