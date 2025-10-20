import React, { useState, useRef, useEffect } from 'react';
import { AggregatedDataRow, ChatMessage } from '../types';
import { getAiChatResponseStream } from '../services/aiService';
import { PulsingLoader } from './icons';

const SendIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
);

const PromptSuggestion: React.FC<{ text: string; onClick: (text: string) => void }> = ({ text, onClick }) => (
    <button
        onClick={() => onClick(text)}
        className="text-xs text-accent bg-accent/10 hover:bg-accent/20 transition-colors px-2.5 py-1.5 rounded-lg text-left"
    >
        {text}
    </button>
);

const AiAssistant: React.FC<{ dataContext: AggregatedDataRow[] }> = ({ dataContext }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async (prompt: string) => {
        if (!prompt.trim() || isLoading) return;

        const newMessages: ChatMessage[] = [...messages, { role: 'user', content: prompt }];
        setMessages(newMessages);
        setUserInput('');
        setIsLoading(true);

        try {
            let fullResponse = '';
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            for await (const chunk of getAiChatResponseStream(prompt, dataContext)) {
                fullResponse += chunk;
                setMessages(prev => {
                    const lastMsgIndex = prev.length - 1;
                    const updatedMessages = [...prev];
                    updatedMessages[lastMsgIndex] = { ...updatedMessages[lastMsgIndex], content: fullResponse };
                    return updatedMessages;
                });
            }
        } catch (error) {
            console.error("AI chat failed:", error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'К сожалению, произошла ошибка. Попробуйте еще раз.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSend(userInput);
    };

    const suggestions = [
        "Кто лидер по росту?",
        "Сравни бренды в Поволжье",
        "Какой регион самый слабый?",
        "Дай сводку по РМ Иванову",
    ];
    
    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color flex flex-col h-[500px]">
            <h2 className="text-xl font-bold mb-4 text-white flex-shrink-0">
                AI-Ассистент
            </h2>
            <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 min-h-0">
                <div className="space-y-4">
                    {messages.length === 0 && (
                         <div className="text-center text-gray-400 p-4 text-sm">
                            <p>Задайте вопрос о текущих данных. Например:</p>
                            <div className="grid grid-cols-2 gap-2 mt-3">
                                {suggestions.map(s => <PromptSuggestion key={s} text={s} onClick={handleSend} />)}
                            </div>
                        </div>
                    )}
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs md:max-w-sm rounded-lg px-3 py-2 text-sm ${
                                msg.role === 'user' 
                                ? 'bg-accent/80 text-white' 
                                : 'bg-gray-700/60 text-gray-200'
                            }`}>
                                <p>{msg.content}</p>
                                {isLoading && msg.role === 'assistant' && index === messages.length -1 && (
                                    <span className="inline-block w-2 h-4 bg-white animate-pulse ml-1"></span>
                                )}
                            </div>
                        </div>
                    ))}
                     {isLoading && messages.length > 0 && (
                        <div className="flex justify-start">
                             <div className="max-w-xs md:max-w-sm rounded-lg px-3 py-2 text-sm bg-gray-700/60 text-gray-200">
                                <PulsingLoader />
                            </div>
                        </div>
                    )}
                </div>
                <div ref={messagesEndRef} />
            </div>
            <div className="mt-4 flex-shrink-0">
                <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
                    <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Спросите о данных..."
                        className="w-full p-2.5 bg-gray-900/50 border border-border-color rounded-lg focus:ring-2 focus:ring-accent-focus focus:border-accent text-white placeholder-gray-500 transition"
                        disabled={isLoading || dataContext.length === 0}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !userInput.trim() || dataContext.length === 0}
                        className="p-2.5 bg-accent hover:bg-accent-hover text-white font-bold rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                       <SendIcon />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AiAssistant;