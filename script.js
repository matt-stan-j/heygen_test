import { StreamingAvatar, AvatarQuality, StreamingEvents, TaskType } from 'https://unpkg.com/@heygen/streaming-avatar@2.1.0/dist/index.esm.js';

class HeyGenAvatarApp {
    constructor() {
        this.avatar = null;
        this.sessionId = null;
        this.isAvatarReady = false;
        this.chatSessionId = this.generateUUID();
        
        // AWS API Gateway URL
        this.AWS_API_URL = 'https://x4p585jeee.execute-api.ap-southeast-1.amazonaws.com/prod';
        
        this.initializeEventListeners();
        this.updateStatus('Ready to start');
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    initializeEventListeners() {
        document.getElementById('startBtn').onclick = () => this.startAvatar();
        document.getElementById('closeBtn').onclick = () => this.stopAvatar();
        document.getElementById('talkBtn').onclick = () => this.sendToAI();
        document.getElementById('taskInput').onkeypress = (e) => {
            if (e.key === 'Enter') this.sendToAI();
        };
    }

    updateStatus(message) {
        const timestamp = new Date().toLocaleTimeString();
        const statusElement = document.getElementById('status');
        statusElement.innerHTML += `[${timestamp}] ${message}<br>`;
        statusElement.scrollTop = statusElement.scrollHeight;
        console.log(`[${timestamp}] ${message}`);
    }

    async fetchAccessToken() {
        try {
            const response = await fetch(`${this.AWS_API_URL}/heygen/create`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                mode: 'cors'
            });
            
            const token = await response.text();
            console.log("Access Token:", token.substring(0, 10) + "...");
            return token;
        } catch (error) {
            console.error("Error fetching access token:", error);
            throw error;
        }
    }

    async startAvatar() {
        try {
            this.updateStatus('Getting access token...');
            document.getElementById('startBtn').disabled = true;
            
            // Get access token from AWS backend
            const accessToken = await this.fetchAccessToken();
            
            // Initialize StreamingAvatar
            this.updateStatus('Initializing avatar...');
            this.avatar = new StreamingAvatar({ token: accessToken });
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Start avatar session
            this.updateStatus('Starting avatar session...');
            const sessionData = await this.avatar.createStartAvatar({
                avatarName: document.getElementById('avatarID').value || 'Wayne_20240711',
                quality: AvatarQuality.Low,
                voice: {
                    rate: 1.0,
                    emotion: 'EXCITED'
                },
                language: 'en'
            });
            
            this.sessionId = sessionData.session_id;
            this.updateStatus(`Avatar session started! Session ID: ${this.sessionId}`);
            
        } catch (error) {
            document.getElementById('startBtn').disabled = false;
            this.updateStatus(`Error: ${error.message}`);
            console.error("Start avatar error:", error);
        }
    }

    setupEventListeners() {
        this.avatar.on(StreamingEvents.STREAM_READY, (event) => {
            console.log('Stream ready:', event.detail);
            this.updateStatus('Avatar stream ready!');
            
            // Attach stream to video element
            const videoElement = document.getElementById('videoElement');
            videoElement.srcObject = event.detail;
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                this.isAvatarReady = true;
                this.updateStatus('Avatar ready for conversation!');
            };
        });

        this.avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
            this.updateStatus('Avatar is speaking...');
        });

        this.avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
            this.updateStatus('Avatar finished speaking');
        });

        this.avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
            this.updateStatus('Stream disconnected');
            this.isAvatarReady = false;
            document.getElementById('startBtn').disabled = false;
        });
    }

    async sendToAI() {
        const input = document.getElementById('taskInput');
        const message = input.value.trim();
        if (!message) return;

        if (!this.isAvatarReady) {
            this.updateStatus('Avatar not ready yet, please wait...');
            return;
        }

        this.updateStatus(`You: ${message}`);
        input.value = '';

        try {
            // Send to AI backend
            this.updateStatus('Sending to AI...');
            
            const aiResponse = await fetch(`${this.AWS_API_URL}/chat`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                mode: 'cors',
                body: JSON.stringify({
                    text: message,
                    session_id: this.chatSessionId
                })
            });

            const aiData = await aiResponse.json();
            console.log("AI response:", aiData);
            
            // Parse the response
            let botMessage;
            if (aiData.body) {
                const bodyData = JSON.parse(aiData.body);
                botMessage = bodyData.message;
            } else {
                botMessage = aiData.message;
            }
            
            this.updateStatus(`AI: ${botMessage}`);

            // Make avatar speak the AI response
            if (this.avatar && this.isAvatarReady && botMessage) {
                await this.avatar.speak({
                    text: botMessage,
                    taskType: TaskType.REPEAT
                });
            }

        } catch (error) {
            this.updateStatus(`AI error: ${error.message}`);
            console.error("AI error:", error);
        }
    }

    async stopAvatar() {
        if (!this.avatar) {
            this.updateStatus('No active avatar session');
            return;
        }

        this.updateStatus('Stopping avatar...');
        
        try {
            await this.avatar.stopAvatar();
            this.avatar = null;
            this.sessionId = null;
            this.isAvatarReady = false;
            
            document.getElementById('startBtn').disabled = false;
            document.getElementById('videoElement').srcObject = null;
            
            this.updateStatus('Avatar session stopped');
            
        } catch (error) {
            this.updateStatus(`Stop error: ${error.message}`);
            console.error("Stop avatar error:", error);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.heygenApp = new HeyGenAvatarApp();
});
