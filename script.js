class HeyGenAWS {
    constructor() {
        this.avatar = null;
        this.chatSessionId = this.generateUUID();
        this.avatarReady = false;
        
        // Replace with your API Gateway URL
        this.AWS_API_URL = 'https://x4p585jeee.execute-api.ap-southeast-1.amazonaws.com/prod';
        
        // Debug: Check what's available
        console.log('All window objects with Stream/HeyGen:', Object.keys(window).filter(k => k.toLowerCase().includes('stream') || k.toLowerCase().includes('heygen')));
        console.log('window.StreamingAvatar:', typeof window.StreamingAvatar);
        console.log('window.HeyGenStreamingAvatar:', typeof window.HeyGenStreamingAvatar);
        console.log('window.StreamingEvents:', typeof window.StreamingEvents);
        
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
        document.getElementById('startBtn').onclick = () => this.startSession();
        document.getElementById('closeBtn').onclick = () => this.closeSession();
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

    async startSession() {
        try {
            this.updateStatus('Getting access token...');
            document.getElementById('startBtn').disabled = true;
            this.avatarReady = false;
            
            // Get access token
            const accessToken = await this.fetchAccessToken();
            
            // Initialize avatar with HeyGen SDK
            this.updateStatus('Initializing avatar...');
            this.avatar = new window.HeyGenStreamingAvatar.StreamingAvatar({ token: accessToken });
            
            // Set up event listeners
            this.avatar.on(window.HeyGenStreamingAvatar.StreamingEvents.AVATAR_START_TALKING, (e) => {
                console.log('Avatar started talking', e);
                this.updateStatus('Avatar is speaking...');
            });
            
            this.avatar.on(window.HeyGenStreamingAvatar.StreamingEvents.AVATAR_STOP_TALKING, (e) => {
                console.log('Avatar stopped talking', e);
                this.updateStatus('Avatar finished speaking');
            });
            
            this.avatar.on(window.HeyGenStreamingAvatar.StreamingEvents.STREAM_DISCONNECTED, () => {
                console.log('Stream disconnected');
                this.updateStatus('Stream disconnected');
                this.avatarReady = false;
            });
            
            this.avatar.on(window.HeyGenStreamingAvatar.StreamingEvents.STREAM_READY, (event) => {
                console.log('Stream ready:', event.detail);
                this.updateStatus('Avatar stream ready!');
                
                // Set up video element
                const mediaElement = document.getElementById('mediaElement');
                mediaElement.srcObject = event.detail;
                mediaElement.onloadedmetadata = () => {
                    mediaElement.play();
                    this.avatarReady = true;
                    this.updateStatus('Avatar ready for conversation!');
                };
            });
            
            // Start avatar session
            this.updateStatus('Starting avatar session...');
            await this.avatar.createStartAvatar({
                quality: 'low', // Use 'low' for better performance
                avatarName: document.getElementById('avatarID').value || 'Wayne_20240711',
                knowledgeId: undefined,
                voice: {
                    rate: 1.0,
                    emotion: 'EXCITED'
                },
                language: 'en'
            });
            
            this.updateStatus('Avatar session started successfully!');

        } catch (error) {
            document.getElementById('startBtn').disabled = false;
            this.updateStatus(`Error: ${error.message}`);
            console.error("Start session error:", error);
        }
    }

    async sendToAI() {
        const input = document.getElementById('taskInput');
        const message = input.value.trim();
        if (!message) return;

        if (!this.avatarReady) {
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

            // Make avatar speak using SDK
            if (this.avatar && botMessage) {
                await this.avatar.speak({
                    text: botMessage,
                    task_type: 'repeat'
                });
            }

        } catch (error) {
            this.updateStatus(`AI error: ${error.message}`);
            console.error("AI error:", error);
        }
    }

    async closeSession() {
        if (!this.avatar) {
            this.updateStatus('No active session');
            return;
        }

        this.updateStatus('Closing session...');
        
        try {
            await this.avatar.stopAvatar();
            this.avatar = null;
            this.avatarReady = false;
            
            document.getElementById('startBtn').disabled = false;
            document.getElementById('mediaElement').srcObject = null;
            
            this.updateStatus('Session closed');
            
        } catch (error) {
            this.updateStatus(`Close error: ${error.message}`);
            console.error("Close session error:", error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.heygenAWS = new HeyGenAWS();
});
