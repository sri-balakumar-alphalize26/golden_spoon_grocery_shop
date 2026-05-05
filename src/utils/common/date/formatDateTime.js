import { format } from 'date-fns';

const formatDateTime = (date = new Date(), formatString = 'dd MMMM yyyy HH:mm:ss') => {
    return date ? format(new Date(date), formatString) : '';
};

export default formatDateTime;

// import { format } from 'date-fns';
// import { utcToZonedTime } from 'date-fns-tz';

// const formatDateTime = (
//     date = new Date(),
//     formatString = 'dd MMMM yyyy HH:mm',
//     timeZone = 'Asia/Kolkata' // Replace with your desired timezone
// ) => {
//     if (!date) return '';
//     const zonedDate = utcToZonedTime(new Date(date), timeZone);
//     return format(zonedDate, formatString);
// };

// export default formatDateTime;
