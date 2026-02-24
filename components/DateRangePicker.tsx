import React, { useState, useRef, useEffect } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ru } from 'date-fns/locale/ru';
import 'react-datepicker/dist/react-datepicker.css';
import { CalendarIcon } from './icons';

registerLocale('ru', ru);

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  className?: string;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  className = ''
}) => {
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    startDate ? new Date(startDate) : null,
    endDate ? new Date(endDate) : null
  ]);
  const [start, end] = dateRange;

  useEffect(() => {
    setDateRange([
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    ]);
  }, [startDate, endDate]);

  const formatToYYYYMMDD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleChange = (update: [Date | null, Date | null]) => {
    setDateRange(update);
    const [newStart, newEnd] = update;
    
    if (newStart) {
      onStartDateChange(formatToYYYYMMDD(newStart));
    } else {
      onStartDateChange('');
    }

    if (newEnd) {
      onEndDateChange(formatToYYYYMMDD(newEnd));
    } else {
      onEndDateChange('');
    }
  };

  return (
    <div className={`relative flex items-center bg-white border border-slate-200 rounded-2xl h-9 px-3 shadow-sm hover:border-indigo-300 transition-colors group ${className}`}>
      <CalendarIcon className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors mr-2" />
      <DatePicker
        selectsRange={true}
        startDate={start}
        endDate={end}
        onChange={handleChange}
        locale="ru"
        dateFormat="dd.MM.yyyy"
        placeholderText="Выберите период"
        className="bg-transparent text-sm text-slate-700 outline-none w-[190px] cursor-pointer font-medium"
        isClearable={true}
        showPopperArrow={false}
        calendarClassName="!border-slate-200 !shadow-xl !rounded-2xl !font-sans !p-2"
        dayClassName={(date) => "!rounded-lg hover:!bg-indigo-50"}
      />
    </div>
  );
};

export default DateRangePicker;
