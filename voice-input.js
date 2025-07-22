// voice-input.js - AWS Transcribe integration for HeyGen Avatar RAG Assistant

class VoiceInputHandler {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        
        // Add UI elements
        this.addVoiceUI();
        this.initializeEventListeners();
    }
    
    addVoiceUI() {
        // Create voice input button
        const inputContainer = document.querySelector('.flex.flex-wrap.gap-2\\.5.mb-5:nth-child(3)');
        
        if (inputContainer) {
            const voiceButton = document.createElement('button');
            voiceButton.id = 'voiceInputBtn';
            voiceButton.className = 'px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600';
            voiceButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 5a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 14a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg> Voice';
            
            inputContainer.appendChild(voiceButton);
            
            // Add status indicator
            const statusIndicator = document.createElement('div');
            statusIndicator.id = 'voiceStatus';
            statusIndicator.className = 'hidden px-3 py-1 bg-gray-200 text-sm rounded-md';
            statusIndicator.textContent = 'Listening...';
            
            inputContainer.appendChild(statusIndicator);
        }
    }
    
    initializeEventListeners() {
        const voiceButton = document.getElementById('voiceInputBtn');
        if (voiceButton) {
            voiceButton.addEventListener('click', () => this.toggleRecording());
        }
    }
    
    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }
    
    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(stream);
            
            this.mediaRecorder.addEventListener('dataavailable', event => {
                this.audioChunks.push(event.data);
            });
            
            this.mediaRecorder.addEventListener('stop', async () => {
                const audioBlob = new Blob(this.audioChunks);
                await this.transcribeAudio(audioBlob);
                
                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());
            });
            
            this.mediaRecorder.start();
            this.isRecording = true;
            
            // Update UI
            const voiceButton = document.getElementById('voiceInputBtn');
            const statusIndicator = document.getElementById('voiceStatus');
            
            if (voiceButton) voiceButton.classList.add('bg-red-500', 'hover:bg-red-600');
            if (statusIndicator) {
                statusIndicator.classList.remove('hidden');
                statusIndicator.textContent = 'Listening...';
            }
            
            // Add to status log
            this.updateStatus('Voice recording started');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.updateStatus(`Error: ${error.message}`);
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Update UI
            const voiceButton = document.getElementById('voiceInputBtn');
            const statusIndicator = document.getElementById('voiceStatus');
            
            if (voiceButton) voiceButton.classList.remove('bg-red-500', 'hover:bg-red-600');
            if (statusIndicator) {
                statusIndicator.textContent = 'Processing...';
            }
            
            this.updateStatus('Voice recording stopped, transcribing...');
        }
    }
    
    async transcribeAudio(audioBlob) {
        try {
            // For initial implementation, we'll use a simpler approach
            // In production, you would send this to your transcribe-auth Lambda
            
            // Create a FormData object to send the audio file
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            
            this.updateStatus('Sending audio for transcription...');
            
            // Send to our transcribe endpoint
            const response = await fetch('https://x4p585jeee.execute-api.ap-southeast-1.amazonaws.com/prod/transcribe', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Transcription failed: ${response.status}`);
            }
            
            const result = await response.json();
            const transcribedText = result.transcript || "Could not transcribe audio";
            
            // Update input field with transcribed text
            const taskInput = document.getElementById('taskInput');
            if (taskInput) {
                taskInput.value = transcribedText;
            }
            
            // Update UI
            const statusIndicator = document.getElementById('voiceStatus');
            if (statusIndicator) {
                statusIndicator.classList.add('hidden');
            }
            
            this.updateStatus(`Transcribed: "${transcribedText}"`);
            
        } catch (error) {
            console.error('Error transcribing audio:', error);
            this.updateStatus(`Transcription error: ${error.message}`);
            
            const statusIndicator = document.getElementById('voiceStatus');
            if (statusIndicator) {
                statusIndicator.classList.add('hidden');
            }
        }
    }
    
    updateStatus(message) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            const timestamp = new Date().toLocaleTimeString();
            statusElement.innerHTML += `[${timestamp}] ${message}<br>`;
            statusElement.scrollTop = statusElement.scrollHeight;
        }
    }
}

// Initialize voice input when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for the main script to initialize
    setTimeout(() => {
        window.voiceInput = new VoiceInputHandler();
    }, 1000);
});
