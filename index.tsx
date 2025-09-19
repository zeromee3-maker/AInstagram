/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { generateImageFromApi } from './api';

// This lets TypeScript know that JSZip is available globally
// from the script tag in index.html.
declare const JSZip: any;

const App = () => {
  const [screen, setScreen] = useState('welcome');
  const [cameraState, setCameraState] = useState('idle');
  const [countdown, setCountdown] = useState(5);
  const [capturedImage, setCapturedImage] = useState(null);
  const [videoStream, setVideoStream] = useState(null);
  const [generatedImages, setGeneratedImages] = useState(new Array(3).fill(null));
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [base64ForGeneration, setBase64ForGeneration] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [hasPrinted, setHasPrinted] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isApiKeyNeeded, setIsApiKeyNeeded] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');


  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  
  const PROMPTS = [
    { name: '1980스티커', prompt: "A late 1990s South Korean 'sticker photo' (스티커 사진) style image of the person. The photo should be bright, high-contrast, and slightly overexposed, with the person making a cute or 'cool' pose popular in 90s K-Pop culture. Add some simple, cute graphic borders or decorative elements like stars or hearts. Do not add any text or letters." },
    { name: '대한제국', prompt: 'A late 19th-century photograph in the style of the Korean Empire (대한제국) era. The person in the image should be formally posed as royalty or nobility, wearing elaborate traditional Korean imperial court attire. The photo should be in sepia or black and white, with a sharp focus and a dignified, solemn atmosphere. The image must not contain any text or letters.' },
    { name: '1920경성', prompt: 'A 1920s Gyeongseong-era (old Seoul) style sepia photograph of the person in the image. They should be dressed in early modern Korean attire, a mix of traditional hanbok and western fashion. The photo should be a formal studio portrait with a slightly soft focus and a nostalgic, antique feel. The image must not contain any text or letters.' },
  ];
  
  useEffect(() => {
    const savedApiKey = localStorage.getItem('gemini-api-key');
    if (savedApiKey) {
        setApiKey(savedApiKey);
        setIsApiKeyNeeded(false);
    } else {
        setIsApiKeyNeeded(true);
    }
  }, []);

  const cleanupCamera = useCallback(() => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, [videoStream]);

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
    }
    return () => cleanupCamera();
  }, [videoStream, cleanupCamera]);

  useEffect(() => {
    const allDone = generatedImages.every(img => img !== null);
    if (allDone && isGenerating) {
      setIsGenerating(false);
    }
  }, [generatedImages, isGenerating]);

  const handleSaveApiKey = () => {
    if (tempApiKey.trim()) {
        localStorage.setItem('gemini-api-key', tempApiKey.trim());
        setApiKey(tempApiKey.trim());
        setIsApiKeyNeeded(false);
        setError('');
    } else {
        setError('유효한 API 키를 입력해주세요.');
    }
  };

  const handleStartClick = async () => {
    setError('');

    if (!apiKey) {
        setError('계속하려면 Gemini API 키를 저장해주세요.');
        setIsApiKeyNeeded(true);
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('카메라 기능을 지원하지 않는 브라우저입니다. 다른 브라우저를 이용해주세요.');
      return;
    }
    
    if (!window.isSecureContext) {
        setError('카메라를 사용하려면 안전한 환경(HTTPS)이 필요합니다. localhost에서 실행하거나 HTTPS를 통해 접속해주세요.');
        return;
    }

    cleanupCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      setVideoStream(stream);
      setScreen('camera');
      setCameraState('idle');
      setCapturedImage(null);
    } catch (err) {
      console.error("Camera permission error:", err);
      let message = '카메라를 시작하는 중 오류가 발생했습니다. 다시 시도해주세요.';
      if (err.name === 'NotAllowedError') {
        message = '카메라 사용 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.';
      } else if (err.name === 'NotFoundError') {
        message = '사용 가능한 카메라를 찾을 수 없습니다.';
      } else if (err.name === 'NotReadableError') {
        message = '카메라를 다른 앱에서 사용 중일 수 있습니다. 다른 앱을 종료하고 다시 시도해주세요.';
      }
      setError(message);
    }
  };

  const handleShutterClick = () => {
    setCameraState('countdown');
    setCountdown(5);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          capturePhoto();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const context = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(dataUrl);
      setCameraState('captured');
      cleanupCamera();
    }
  };

  const handleRetakeClick = () => {
    handleStartClick();
  };

  const handleNextClick = async () => {
    if (!capturedImage) return;
    setScreen('results');
    setIsGenerating(true);
    setGeneratedImages(new Array(3).fill(null));
    setSelectedImage(null);
    setError('');

    const base64Data = capturedImage.split(',')[1];
    setBase64ForGeneration(base64Data);

    const imagePart = {
      inlineData: { data: base64Data, mimeType: 'image/jpeg' },
    };

    PROMPTS.forEach((item, index) => {
      generateImage(item.prompt, imagePart, index);
    });
  };

  const generateImage = async (prompt, imagePart, index) => {
    try {
      const imageUrl = await generateImageFromApi(apiKey, prompt, imagePart);
      setGeneratedImages(prev => {
        const newImages = [...prev];
        newImages[index] = imageUrl;
        return newImages;
      });
    } catch (err) {
      console.error(`Error generating image for prompt "${prompt}":`, err.message);
      if (err.message.toLowerCase().includes('api key not valid')) {
        setError('API 키가 유효하지 않습니다. 확인 후 다시 입력해주세요.');
        localStorage.removeItem('gemini-api-key');
        setApiKey('');
        setIsApiKeyNeeded(true);
        setScreen('welcome'); // Go back to welcome screen to fix key
      }
      setGeneratedImages(prev => {
        const newImages = [...prev];
        newImages[index] = { error: true, message: err.message };
        return newImages;
      });
    }
  };

  const handleRegenerateClick = (index, e) => {
      e.stopPropagation();
      if (!base64ForGeneration) return;

      setGeneratedImages(prev => {
          const newImages = [...prev];
          newImages[index] = null;
          return newImages;
      });

      const imagePart = {
        inlineData: { data: base64ForGeneration, mimeType: 'image/jpeg' },
      };
      const prompt = PROMPTS[index].prompt;
      generateImage(prompt, imagePart, index);
  }

  const handleImageClick = (imageSrc) => {
    if (!imageSrc || imageSrc.error) return;
    setSelectedImage(imageSrc);
    setIsPrintModalOpen(true);
  };

  const handleSaveClick = async () => {
    setError('');
    const imagesToSave = generatedImages
      .map((img, index) => ({ img, index }))
      .filter(item => item.img && !item.img.error);

    if (imagesToSave.length === 0) return;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `aistagram-images-${timestamp}`;

    const zip = new JSZip();
    
    imagesToSave.forEach(({ img, index }) => {
      const base64Data = img.split(',')[1];
      const mimeType = img.substring(5, img.indexOf(';'));
      const extension = mimeType.split('/')[1] || 'jpeg';
      const promptName = PROMPTS[index].name.replace(/\s+/g, '-');
      zip.file(`${promptName}.${extension}`, base64Data, { base64: true });
    });

    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${filename}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch(err) {
      console.error("Error creating zip file:", err);
      setError("ZIP 파일을 생성하는 중 오류가 발생했습니다.");
    }
  };
  
  const handleCloseModal = () => {
    setIsPrintModalOpen(false);
    setSelectedImage(null);
  };
  
  const handlePrintFromModal = () => {
    window.print();
    setHasPrinted(true);
  };

  const handleRestartClick = () => {
      cleanupCamera();
      setScreen('welcome');
      setCameraState('idle');
      setCountdown(5);
      setCapturedImage(null);
      setGeneratedImages(new Array(3).fill(null));
      setIsGenerating(false);
      setError('');
      setSelectedImage(null);
      setBase64ForGeneration(null);
      setHasPrinted(false);
  };

  const renderCountdownOverlay = () => {
    if (cameraState !== 'countdown') return null;
    return (
      <div className="camera-overlay">
        <div className="countdown-wrapper">
          <div className="spinner spinner--large"></div>
          <span className="countdown-text">{countdown > 0 && countdown}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container" data-screen={screen}>
      <header className="header">
        <h1 className="title"><strong>아인</strong>스타그램</h1>
        <h2 className="subtitle">(<strong>AIn</strong>stagram)</h2>
      </header>
      <div className="screens-wrapper">
        {/* Screen 1: Welcome */}
        <div className="screen">
          <div className="content">
            <div className="welcome-main">
              <p className="description">
                셀카 한 장으로 마법처럼 변신!
                <br />
                나만의 AI스타그램을 만들어봐요!
              </p>
            </div>
            <div className="welcome-footer">
               {isApiKeyNeeded && (
                <div className="api-key-container">
                    <div className="api-key-input-group">
                        <input
                            id="apiKeyInput"
                            type="password"
                            value={tempApiKey}
                            onChange={(e) => setTempApiKey(e.target.value)}
                            placeholder="Gemini API 키를 여기에 붙여넣으세요"
                            aria-label="Gemini API 키"
                        />
                        <button className="button button-secondary" onClick={handleSaveApiKey}>저장</button>
                    </div>
                    <p className="api-key-info">API 키는 브라우저에만 저장됩니다.</p>
                </div>
              )}
              {error && <p className="error-message">{error}</p>}
              <button className="button button-primary" onClick={handleStartClick} disabled={isApiKeyNeeded}>START</button>
            </div>
          </div>
        </div>

        {/* Screen 2: Camera */}
        <div className="screen">
          <div className="content content-camera">
            <div className="camera-view">
              <video ref={videoRef} autoPlay playsInline className={`video-feed ${cameraState === 'idle' || cameraState === 'captured' ? 'hidden' : ''}`}></video>
              {capturedImage && <img src={capturedImage} alt="Captured selfie" className="captured-image" />}
              
              {cameraState === 'idle' && (
                <div className="camera-prompt-overlay">
                   <p className="description">
                    <span className="highlight-number">5</span>초 준비 타임!<br />
                    포즈 잡고, 표정 장전하고…<br />
                    <br />
                    찰칵!
                   </p>
                   <button className="shutter-button" onClick={handleShutterClick} aria-label="Start countdown and take photo"></button>
                </div>
              )}
              
              {renderCountdownOverlay()}
            </div>
            
            {cameraState === 'captured' && (
              <div className="button-group">
                <button className="button button-primary button-with-border" onClick={handleRetakeClick}>다시 촬영하기</button>
                <button className="button button-secondary" onClick={handleNextClick}>다음 단계로</button>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden"></canvas>
          </div>
        </div>

        {/* Screen 3: Results */}
        <div className="screen">
          <div className="content">
            {/* This panel is only visible on large screens via CSS */}
            <div className="results-original-image-panel">
              <h3 className="panel-title">원본 사진</h3>
              <div className="original-image-container">
                {capturedImage && <img src={capturedImage} alt="Original selfie" className="original-image" />}
              </div>
            </div>

            <div className="results-main-panel">
              <p className="results-header-text">
                {isGenerating ? 'AI가 나를 스타일링 중… 잠깐만 기다려줘!' : '마음에 드는 스타일을 선택하세요!'}
              </p>
              <div className="results-grid">
                {generatedImages.map((image, index) => (
                  <div key={index} className="result-item">
                    <div 
                      className={`image-slot ${selectedImage === image ? 'selected' : ''}`}
                      onClick={() => handleImageClick(image)}
                    >
                      {(() => {
                        if (image && image.error) {
                          return (
                            <div className="error-content" title={image.message}>
                                <div className="error-indicator">!</div>
                                <p className="error-text">생성 실패</p>
                                <button className="button button-regenerate" onClick={(e) => handleRegenerateClick(index, e)}>
                                    다시 생성
                                </button>
                            </div>
                          );
                        }
                        if (image) {
                          return <img src={image} alt={`Generated style ${index + 1}`} className="generated-image" />;
                        }
                        return <div className="spinner spinner--small"></div>;
                      })()}
                    </div>
                    <p className="prompt-name">{PROMPTS[index].name}</p>
                  </div>
                ))}
              </div>
              {!isGenerating && (
                <div className="results-footer">
                   {error && <p className="error-message">{error}</p>}
                   {generatedImages.some(img => img && !img.error) && (
                    <div className="button-group">
                      <button className="button button-primary button-with-border" onClick={handleSaveClick} disabled={isGenerating || !generatedImages.some(img => img && !img.error)}>모두 저장</button>
                      <button className="button button-secondary" onClick={handleRestartClick}>처음으로</button>
                    </div>
                   )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {isPrintModalOpen && (
        <div className="modal-overlay">
            <div className="modal-content">
                <img src={selectedImage} alt="Selected for printing" className="modal-image" />
                <div className="modal-footer">
                    {!hasPrinted && <button className="button button-primary button-with-border" onClick={handlePrintFromModal}>Print</button>}
                    <button className="button button-secondary" onClick={handleCloseModal}>Close</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);