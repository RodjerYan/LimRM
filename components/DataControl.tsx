import React from 'react';
import FileUpload from './FileUpload';
import OKBManagement from './OKBManagement';
import { OkbStatus, FileProcessingState, OkbDataRow } from '../types';

interface DataControlProps {
    processingState: FileProcessingState;
    onStartProcessing: (file: File) => void;
    onOkbStatusChange: (status: OkbStatus) => void;
    onOkbDataChange: (data: OkbDataRow[]) => void;
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
                processingState={props.processingState}
                onStartProcessing={props.onStartProcessing}
                okbStatus={props.okbStatus}
                disabled={props.disabled || !props.okbStatus || props.okbStatus.status !== 'ready'}
            />
        </div>
    );
};

export default DataControl;