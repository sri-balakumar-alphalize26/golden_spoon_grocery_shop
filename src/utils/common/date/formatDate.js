// File: formatDate.js
import { format } from 'date-fns';

const formatDate = (date = new Date(), formatString = 'dd MMMM yyyy') => {
  return date ? format(date, formatString) : '';
};

export default formatDate;
