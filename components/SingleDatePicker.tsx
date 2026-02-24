import React, { useState, useEffect } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ru } from 'date-fns/locale/ru';
import 'react-datepicker/dist/react-datepicker.css';
import { CalendarIcon } from './icons';

registerLocale('ru', ru);

interface SingleDatePickerProps {
  date: string;
  onChange: (date: string) => void;
  className?: string;
  minDate?: Date;
}

const SingleDatePicker: React.FC<SingleDatePickerProps> = ({
  date,
  onChange,
  className = '',
  minDate
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    date ? new Date(date) : null
  );

  useEffect(() => {
    setSelectedDate(date ? new Date(date) : null);
  }, [date]);

  const formatToYYYYMMDD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleChange = (newDate: Date | null) => {
    setSelectedDate(newDate);
    if (newDate) {
      onChange(formatToYYYYMMDD(newDate));
    } else {
      onChange('');
    }
  };

  return (
    <div className={`relative flex items-center bg-white border border-slate-200 rounded-lg h-10 px-3 shadow-sm hover:border-indigo-300 transition-colors group ${className}`}>
      <CalendarIcon className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors mr-2" />
      <DatePicker
        selected={selectedDate}
        onChange={handleChange}
        locale="ru"
        dateFormat="dd.MM.yyyy"
        placeholderText="Выберите дату"
        className="bg-transparent text-sm text-slate-700 outline-none w-full cursor-pointer font-medium"
        isClearable={false}
        showPopperArrow={false}
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
        minDate={minDate}
        portalId="datepicker-portal"
        calendarClassName="!border-slate-200 !shadow-xl !rounded-2xl !font-sans !p-2"
        dayClassName={(date) => "!rounded-lg hover:!bg-indigo-50"}
      />
    </div>
  );
};

export default SingleDatePicker;
