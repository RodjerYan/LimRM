import React from 'react';
// FIX: The import for FileUpload was failing because the component was missing a default export. This has been fixed in FileUpload.tsx.
import FileUpload from './FileUpload';
import OKBManagement from './OKBManagement';
// Fix: Import WorkerResultPayload to correctly type the onDataLoaded prop, resolving the type mismatch with the FileUpload component.
// FIX: Add GeoCache type for new props.
import { AggregatedDataRow, GeoCache, OkbStatus, WorkerResultPayload } from '../types';

interface DataControlProps {
    // Fix: Changed the type of 'data' from 'AggregatedDataRow[]' to 'WorkerResultPayload' to match the expected signature of the 'onFileProcessed' prop in the FileUpload component.
    onDataLoaded: (data: WorkerResultPayload) => void;
    onLoadingStateChange: (isLoading: boolean, message: string) => void;
    onOkbStatusChange: (status: OkbStatus) => void;
    onOkbDataChange: (data: any[]) => void;
    okbData: any[];
    okbStatus: OkbStatus | null;
    disabled: boolean;
    // FIX: Add missing props required by child components OKBManagement and FileUpload.
    geoCacheSize: number;
    onClearGeoCache: () => void;
    geoCache: GeoCache;
}

const DataControl: React.FC<DataControlProps> = (props) => {
    return (
        <div className="space-y-6">
            <OKBManagement 
                onStatusChange={props.onOkbStatusChange}
                onDataChange={props.onOkbDataChange}
                status={props.okbStatus}
                disabled={props.disabled}
                // FIX: Pass down the required props to OKBManagement.
                geoCacheSize={props.geoCacheSize}
                onClearGeoCache={props.onClearGeoCache}
            />
            <FileUpload 
                onFileProcessed={props.onDataLoaded}
                onProcessingStateChange={props.onLoadingStateChange}
                okbData={props.okbData}
                okbStatus={props.okbStatus}
                disabled={props.disabled || !props.okbStatus || props.okbStatus.status !== 'ready'}
                // FIX: Pass down the required geoCache prop to FileUpload.
                geoCache={props.geoCache}
            />
        </div>
    );
};

export default DataControl;