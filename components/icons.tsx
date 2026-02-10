
import React from 'react';

interface IconProps {
    className?: string;
    small?: boolean;
}

export const LoaderIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <div className={`border-2 border-current border-t-transparent rounded-full animate-spin ${size} ${className || ''}`}></div>
    );
};

export const SuccessIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
    );
};

export const ErrorIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
    );
};

export const InfoIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
    );
};

export const SearchIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
    );
};

export const CheckIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
        </svg>
    );
};

export const SaveIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
        </svg>
    );
};

export const TrashIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
    );
};

export const RetryIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
    );
};

export const RefreshIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
    );
};

export const SyncIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
    );
};

export const ArrowLeftIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
        </svg>
    );
};

export const MaximizeIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
        </svg>
    );
};

export const MinimizeIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 14h6m0 0v6m0-6L4 20m5-5l5-5m5 5v-6m0 6h6m-6 0l6 6M4 4l5 5"></path>
        </svg>
    );
};

export const SunIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
        </svg>
    );
};

export const MoonIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
        </svg>
    );
};

export const FactIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
    );
};

export const AlertIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
    );
};

export const ChannelIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
        </svg>
    );
};

export const SortIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-3 h-3" : "w-4 h-4";
    return (
        <svg className={`${size} ${className || ''}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
        </svg>
    );
};

export const SortUpIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-3 h-3" : "w-4 h-4";
    return (
        <svg className={`${size} ${className || ''} text-accent`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
        </svg>
    );
};

export const SortDownIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-3 h-3" : "w-4 h-4";
    return (
        <svg className={`${size} ${className || ''} text-accent`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
    );
};

export const ExportIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
        </svg>
    );
};

export const CopyIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
        </svg>
    );
};

export const PotentialIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84" />
        </svg>
    );
};

export const GrowthIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
};

export const UsersIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
    );
};

export const TrendingUpIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307L21.75 6.75M21.75 6.75H16.875M21.75 6.75V11.625" />
        </svg>
    );
};

export const CalculatorIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-3-9.75h.008v.008H12.75V8.25zm0 2.25h.008v.008H12.75V10.5zm0 2.25h.008v.008H12.75V12.75zm0 2.25h.008v.008H12.75V15zm-3-4.5h.008v.008H9.75V10.5zm0 2.25h.008v.008H9.75V12.75zm0 2.25h.008v.008H9.75V15zm-3-4.5h.008v.008H6.75V10.5zm0 2.25h.008v.008H6.75V12.75zm0 2.25h.008v.008H6.75V15zm-3-10.5h16.5a1.5 1.5 0 011.5 1.5v13.5a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 011.5-1.5z" />
        </svg>
    );
};

export const CoverageIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25s-7.5-4.108-7.5-11.25a7.5 7.5 0 1 115 0z" />
        </svg>
    );
};

export const DataIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
    );
};

export const BrainIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925-3.546 5.974 5.974 0 01-2.133-1.001A3.75 3.75 0 0012 18z" />
        </svg>
    );
};

export const TargetIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
};

export const WarningIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
    );
};

export const LabIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v1.244c0 .462-.366.846-.827.875A3.375 3.375 0 007.875 8.625v.75M14.25 3.104v1.244c0 .462.366.846.827.875a3.375 3.375 0 011.048 3.402v.75M7.875 9.375v.75a.375.375 0 00.375.375h.75m5.25-1.125v.75a.375.375 0 01-.375.375h-.75" />
        </svg>
    );
};

export const ProphetIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.644C3.399 8.049 7.152 5.25 12 5.25c4.848 0 8.601 2.799 9.964 6.428.038.1.038.214 0 .314-1.364 3.629-5.116 6.428-9.964 6.428-4.848 0-8.601-2.799-9.964-6.428z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    );
};

export const WaterfallIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625" />
        </svg>
    );
};

export const AnalyticsIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
        </svg>
    );
};

export const ChartBarIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
        </svg>
    );
};

export const CloudDownloadIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3"></path>
        </svg>
    );
};

export const GlobeIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
    );
};

export const HeartIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z"></path>
        </svg>
    );
};

export const CalendarIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
        </svg>
    );
};

export const FilterIcon: React.FC<IconProps> = ({ className, small }) => {
    const size = small ? "w-4 h-4" : "w-5 h-5";
    return (
        <svg className={`${size} ${className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
        </svg>
    );
};
