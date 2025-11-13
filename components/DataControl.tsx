import React from 'react';
import FileUpload from './FileUpload';
import OKBManagement from './OKBManagement';
// Fix: Import WorkerResultPayload to correctly type the onDataLoaded prop, resolving the type mismatch with the FileUpload component.
import { AggregatedDataRow, OkbStatus, WorkerResultPayload } from '../types';

interface DataControlProps {
    // Fix: Changed the type of 'data' from 'AggregatedDataRow[]' to 'WorkerResultPayload' to match the expected signature of the 'onFileProcessed' prop in the FileUpload component.
    onDataLoaded: (data: WorkerResultPayload) => void;
    onLoadingStateChange: (isLoading: boolean, message: string) => void;
    onOkbStatusChange: (status: OkbStatus) => void;
    onOkbDataChange: (data: any[]) => void;
    okbData: any[];
    okbStatus: OkbStatus | null;
    disabled: boolean;
}

const DataControl: React.FC<DataControlProps> = (props) => {
    return (
        <div className="space-y-6">
            <OKBManagement 
                onStatusChange={props.onOkbStatusChange}
                onDataChange={props.onOkbDataChange}
                status={props.okbStatus}
                disabled={props.disabled}
            />
            <FileUpload 
                onFileProcessed={props.onDataLoaded}
                onProcessingStateChange={props.onLoadingStateChange}
                okbData={props.okbData}
                okbStatus={props.okbStatus}
                disabled={props.disabled || !props.okbStatus || props.okbStatus.status !== 'ready'}
            />
        </div>
    );
};

export default DataControl;