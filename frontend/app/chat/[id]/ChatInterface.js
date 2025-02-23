"use client"
import { useState } from 'react';
import { PlaceholdersAndVanishInput } from '@/components/ui/placeholders-and-vanish-input';
import { supportedLanguages } from '@/utils/languages';
const ChatInterface = () => {
  const [userInput, setUserInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('english');
  const [selectedPrediction, setSelectedPrediction] = useState('chest-predict');
  const [selectedFile, setSelectedFile] = useState(null);

  const placeholders = [
    "What are your symptoms?",
    "How can I assist with your health concerns?",
    // ... rest of the placeholders ...
  ];

  const predictionOptions = [
    { value: 'chest-predict', label: 'Chest X-Ray Analysis' },
    { value: 'pneumonia-predict', label: 'Pneumonia Detection' },
    { value: 'edema-predict', label: 'Edema Analysis' }
  ];

  const handleInputChange = (e) => {
    setUserInput(e.target.value);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const newMessage = { type: 'user', content: userInput };
    setMessages([...messages, newMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/hit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userQuery: true,
          personalizedPlan: false,
          queryData: userInput,
          userId: 'req.user.id',
          language: selectedLanguage
        })
      });

      const data = await response.json();
      
      if (data.success && data.reply) {
        setMessages(prev => [...prev, { type: 'ai', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { type: 'ai', content: 'Sorry, I encountered an error. Please try again.' }]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { type: 'ai', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }

    setUserInput('');
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`http://localhost:5000/diseases/${selectedPrediction}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      const data = await response.json();
      
      if (data.success) {
        const predictionLabel = predictionOptions.find(opt => opt.value === selectedPrediction)?.label;
        const resultMessage = data.prediction === 0 
          ? `Based on the analysis, there are no signs of ${predictionLabel} in the uploaded image.`
          : `The analysis indicates potential signs of ${predictionLabel}. We recommend consulting with your nearest healthcare provider for a proper medical evaluation.`;

        // Create a message with the image preview
        const imageMessage = (
          <div>
            <p>Uploaded image for {predictionLabel}:</p>
            <img 
              src={URL.createObjectURL(selectedFile)} 
              alt="Uploaded" 
              className="max-w-full h-auto max-h-60 object-contain"
            />
          </div>
        );

        setMessages(prev => [
          ...prev,
          { type: 'user', content: imageMessage },
          { type: 'ai', content: resultMessage }
        ]);
      } else {
        setMessages(prev => [...prev, { type: 'ai', content: 'Sorry, prediction failed. Please try again.' }]);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      setMessages(prev => [...prev, { type: 'ai', content: 'Sorry, an error occurred during prediction.' }]);
    } finally {
      setIsLoading(false);
      setSelectedFile(null);
      e.target.reset();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen relative">
      <div className="sticky top-0 z-20 w-full bg-white/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <select
                value={selectedPrediction}
                onChange={(e) => setSelectedPrediction(e.target.value)}
                className="p-2 border rounded-md bg-black text-white shadow-sm hover:bg-gray-800 transition-colors cursor-pointer"
              >
                {predictionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <form onSubmit={handleFileUpload} className="flex gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800 file:transition-colors file:cursor-pointer"
                />
                <button
                  type="submit"
                  disabled={!selectedFile}
                  className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Upload
                </button>
              </form>
            </div>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="p-2 border rounded-md bg-black text-white shadow-sm w-36 hover:bg-gray-800 transition-colors cursor-pointer"
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto z-10 max-w-7xl mx-auto w-full p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.type === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-4 ${
                message.type === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[70%] rounded-lg p-4 bg-gray-200 text-gray-800">
              <div className="flex space-x-2">
                <div className="w-2 h-2 rounded-full bg-gray-600 animate-[bounce_1s_infinite_0ms]"></div>
                <div className="w-2 h-2 rounded-full bg-gray-600 animate-[bounce_1s_infinite_200ms]"></div>
                <div className="w-2 h-2 rounded-full bg-gray-600 animate-[bounce_1s_infinite_400ms]"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 w-full bg-white/80 backdrop-blur-sm border-t">
        <div className="max-w-2xl mx-auto p-4">
          <div className="flex">
            <PlaceholdersAndVanishInput
              value={userInput}
              onChange={handleInputChange}
              onSubmit={handleSendMessage}
              placeholders={placeholders}
              className="flex-1 min-w-0 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
