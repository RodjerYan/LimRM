
    // Initialize Worker logic (abstracted to be reused by both file and cloud flow)
    const initWorker = useCallback(async (
        startMessage: string,
        fileNameForState: string
    ) => {
        // Reset buffers
        aggregatedDataBuffer.current = [];
        unidentifiedBuffer.current = [];

        // Reset State
        setProcessingState({
            isProcessing: true,
            progress: 0,
            message: startMessage,
            fileName: fileNameForState,
            backgroundMessage: null,
            startTime: Date.now(),
            logs: [],
            loadedCount: 0
        });

        // Pre-load cache
        let cacheData: CoordsCache = {};
        try {
            const response = await fetch(`/api/get-full-cache?t=${Date.now()}`, { cache: 'no-store' });
            if (response.ok) {
                cacheData = await response.json();
                setProcessingState(prev => ({ ...prev, message: 'Кэш загружен, инициализация...' }));
            } else {
                console.warn('Не удалось загрузить кэш координат.');
                setProcessingState(prev => ({ ...prev, message: 'Не удалось загрузить кэш, инициализация...' }));
            }
        } catch (error) {
            console.error('Ошибка при загрузке кэша координат:', error);
            setProcessingState(prev => ({ ...prev, message: 'Ошибка кэша, инициализация...' }));
        }

        if (workerRef.current) {
            workerRef.current.terminate();
        }

        workerRef.current = new Worker(new URL('./services/processing.worker.ts', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = async (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            switch (msg.type) {
                case 'progress':
                    if (msg.payload.isBackground) {
                        if (msg.payload.percentage === 100 || msg.payload.message.toLowerCase().includes('завершен')) {
                            setProcessingState(prev => ({ ...prev, backgroundMessage: null }));
                        } else {
                            setProcessingState(prev => ({ ...prev, backgroundMessage: msg.payload.message }));
                        }
                    } else {
                        // UPDATE: Accumulate logs for terminal view
                        setProcessingState(prev => ({ 
                            ...prev, 
                            progress: msg.payload.percentage, 
                            message: msg.payload.message,
                            logs: [...prev.logs.slice(-5), msg.payload.message] // Keep last 6 logs
                        }));
                    }
                    break;
                
                // NEW STREAMING HANDLERS
                case 'result_init':
                    setOkbRegionCounts(msg.payload.okbRegionCounts);
                    setDateRange(msg.payload.dateRange);
                    if (msg.payload.dateRange) {
                        addNotification(`Определен период данных: ${msg.payload.dateRange}`, 'info');
                    }
                    break;
                case 'result_chunk_aggregated':
                    // Accumulate chunks
                    const chunk = (msg.payload as AggregatedDataRow[]);
                    aggregatedDataBuffer.current.push(...chunk);
                    // UPDATE: Increment loadedCount for real-time visualization
                    setProcessingState(prev => ({ 
                        ...prev, 
                        loadedCount: prev.loadedCount + chunk.length 
                    }));
                    break;
                case 'result_chunk_unidentified':
                    unidentifiedBuffer.current.push(...(msg.payload as UnidentifiedRow[]));
                    break;
                case 'result_finished':
                    handleResultFinished();
                    setProcessingState(prev => ({ 
                        ...prev, 
                        isProcessing: false, 
                        progress: 100, 
                        message: 'Обработка завершена!' 
                    }));
                    break;

                // Handle delegated background tasks
                case 'background':
                    if (msg.payload && 'type' in msg.payload) {
                        // Task: Save Cache Batch
                        if (msg.payload.type === 'save_cache_batch') {
                            const { rmName, rows, batchId } = msg.payload.payload;
                            
                            // --- NEW: Logging & Safety Check ---
                            console.log('[SAVE_CACHE]', rmName, rows?.length);
                            
                            if (!rows || rows.length === 0) {
                                workerRef.current?.postMessage({
                                    type: 'ACK',
                                    payload: { batchId }
                                });
                                break;
                            }
                            // ------------------------------------

                            // Perform fetch in main thread
                            // Enhanced Retry Logic for 500/429 Quota Errors
                            for (let attempt = 0; attempt < 5; attempt++) {
                                try {
                                    const res = await fetch('/api/add-to-cache', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        credentials: 'include', // Ensure cookies are sent if needed
                                        body: JSON.stringify({ rmName, rows })
                                    });
                                    
                                    if (!res.ok) {
                                        const text = await res.text();
                                        throw new Error(`API Error: ${text}`);
                                    }
                                    
                                    // SUCCESS: Send ACK
                                    workerRef.current?.postMessage({
                                        type: 'ACK',
                                        payload: { batchId }
                                    });
                                    break; 
                                } catch (err) {
                                    console.error(`Save cache failed attempt ${attempt+1} for ${rmName}:`, err);
                                    
                                    // Check if it's likely a quota or rate limit error
                                    const errorMessage = String(err);
                                    const isQuotaError = errorMessage.includes('Quota exceeded') || errorMessage.includes('429') || errorMessage.includes('500');
                                    
                                    if (attempt === 4) {
                                        addNotification(`Ошибка сохранения адресов для ${rmName} (пакет ${batchId})`, 'error');
                                        // Even on failure, ACK to prevent worker hang. Data won't be cached this run, but app continues.
                                        workerRef.current?.postMessage({
                                            type: 'ACK',
                                            payload: { batchId }
                                        });
                                    } else {
                                        // Exponential Backoff: 2s, 4s, 8s, 16s...
                                        // If confirmed quota/500 error, add base padding
                                        const baseDelay = 2000 * Math.pow(2, attempt);
                                        const delay = isQuotaError ? baseDelay + 3000 : baseDelay;
                                        
                                        console.warn(`[Retry] Waiting ${delay}ms before next attempt...`);
                                        await new Promise(r => setTimeout(r, delay));
                                    }
                                }
                            }
                        }
                        
                        // Task: Start Geocoding
                        if (msg.payload.type === 'start_geocoding_tasks') {
                            const { tasks } = msg.payload.payload;
                            handleBackgroundGeocoding(tasks);
                        }
                    }
                    break;

                case 'error':
                    setProcessingState(prev => ({ 
                        ...prev, 
                        isProcessing: false, 
                        message: `Ошибка: ${msg.payload}`,
                        backgroundMessage: null
                    }));
                    addNotification(`Ошибка при обработке файла: ${msg.payload}`, 'error');
                    break;
                default:
                    break;
            }
        };

        workerRef.current.onerror = (e) => {
            console.error('Worker error:', e);
            setProcessingState(prev => ({ 
                ...prev, 
                isProcessing: false, 
                message: `Критическая ошибка: ${e.message}` 
            }));
            addNotification(`Критическая ошибка воркера: ${e.message}`, 'error');
        };
        
        // Start Worker State with Init Message
        const initMsg: WorkerInputInit = {
            type: 'INIT_STREAM',
            payload: { okbData, cacheData }
        };
        workerRef.current.postMessage(initMsg);

    }, [okbData, handleResultFinished, addNotification, handleBackgroundGeocoding]);
