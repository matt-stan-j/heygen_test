class HeyGenAWS {
    constructor() {
        this.sessionInfo = null;
        this.room = null;
        this.mediaStream = null;
        this.sessionToken = null;
        this.chatSessionId = this.generateUUID();
        
        // Replace with your API Gateway URL
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

    decodeHtml(html) {
        if (!html || typeof html !== 'string') return html;
        // Only decode if it contains HTML entities
        if (html.includes('&')) {
            const txt = document.createElement('textarea');
            txt.innerHTML = html;
            return txt.value;
        }
        return html;
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

    async startSession() {
        try {
            this.updateStatus('Creating HeyGen session...');
            document.getElementById('startBtn').disabled = true;
            
            // Call AWS Lambda to create HeyGen session
            const response = await fetch(`${this.AWS_API_URL}/heygen/create`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                mode: 'cors',
                body: JSON.stringify({
                    avatar_name: document.getElementById('avatarID').value,
                    voice_id: document.getElementById('voiceID').value
                })
            });

            const data = await response.json();
            console.log("Create session response:", data);
            
            // Handle nested response format
            if (data.body) {
                const bodyData = JSON.parse(data.body);
                this.sessionInfo = bodyData.session_info;
                this.sessionToken = this.decodeHtml(bodyData.session_token);
            } else {
                this.sessionInfo = data.session_info;
                this.sessionToken = this.decodeHtml(data.session_token);
            }
            
            if (!this.sessionInfo) {
                throw new Error("Failed to create session");
            }
            
            this.updateStatus(`Session created: ${this.sessionInfo.session_id}`);

            await this.setupLiveKit();
            await this.startStreaming();
            
            this.updateStatus('Avatar ready!');

        } catch (error) {
            document.getElementById('startBtn').disabled = false;
            this.updateStatus(`Error: ${error.message}`);
            console.error("Start session error:", error);
        }
    }

    async setupLiveKit() {
        this.updateStatus('Setting up LiveKit connection...');
        
        try {
            this.room = new LivekitClient.Room({
                adaptiveStream: true,
                dynacast: true,
                videoCaptureDefaults: {
                    resolution: LivekitClient.VideoPresets.h720.resolution,
                }
            });

            this.mediaStream = new MediaStream();
            
            this.room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
                console.log("Track subscribed:", track.kind);
                if (track.kind === 'video' || track.kind === 'audio') {
                    this.mediaStream.addTrack(track.mediaStreamTrack);
                    if (this.mediaStream.getVideoTracks().length > 0) {
                        document.getElementById('mediaElement').srcObject = this.mediaStream;
                        this.updateStatus('Video stream connected');
                    }
                }
            });

            await this.room.prepareConnection(this.sessionInfo.url, this.sessionInfo.access_token);
            this.updateStatus('LiveKit connection prepared');
        } catch (error) {
            this.updateStatus(`LiveKit setup error: ${error.message}`);
            console.error("LiveKit setup error:", error);
            throw error;
        }
    }

    async startStreaming() {
        this.updateStatus('Starting streaming...');
        
        try {
            // Connect to LiveKit first
            await this.room.connect(this.sessionInfo.url, this.sessionInfo.access_token);
            this.updateStatus('LiveKit connected');
            
            // Add a small delay to ensure connection is stable
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Then start the HeyGen session
            const startResponse = await fetch(`${this.AWS_API_URL}/heygen/start`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                mode: 'cors',
                body: JSON.stringify({
                    session_id: this.sessionInfo.session_id,
                    session_token: this.sessionToken
                })
            });
            
            const startData = await startResponse.json();
            console.log("Start streaming response:", startData);
            
            this.updateStatus('Streaming started');
        } catch (error) {
            this.updateStatus(`Streaming error: ${error.message}`);
            console.error("Streaming error:", error);
            throw error;
        }
    }

    async sendToAI() {
        const input = document.getElementById('taskInput');
        const message = input.value.trim();
        if (!message) return;

        this.updateStatus(`You: ${message}`);
        input.value = '';

        try {
            // Send to your AI backend
            this.updateStatus('Sending to AI...');
            console.log("Sending to AI:", message);
            
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
            
            // Parse the nested JSON response
            let botMessage;
            if (aiData.body) {
                // Response from API Gateway includes a body property with JSON string
                const bodyData = JSON.parse(aiData.body);
                botMessage = bodyData.message;
            } else {
                botMessage = aiData.message;
            }
            
            this.updateStatus(`AI: ${botMessage}`);

            // Make avatar speak the AI response
            if (this.sessionInfo && botMessage) {
                await this.makeAvatarSpeak(botMessage);
            }

        } catch (error) {
            this.updateStatus(`AI error: ${error.message}`);
            console.error("AI error:", error);
        }
    }

    async makeAvatarSpeak(text) {
        this.updateStatus('Avatar speaking...');
        console.log("Making avatar speak:", text);
        
        try {
            const speakResponse = await fetch(`${this.AWS_API_URL}/heygen/speak`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                mode: 'cors',
                body: JSON.stringify({
                    session_id: this.sessionInfo.session_id,
                    session_token: this.sessionToken,
                    text: text
                })
            });
            
            const speakData = await speakResponse.json();
            console.log("Speak response:", speakData);
            
            // Handle nested response format
            let success = false;
            if (speakData.body) {
                const bodyData = JSON.parse(speakData.body);
                success = bodyData.success;
            } else {
                success = speakData.success;
            }
            
            if (success) {
                this.updateStatus('Avatar speaking request sent');
            } else {
                this.updateStatus('Failed to make avatar speak');
            }
        } catch (error) {
            this.updateStatus(`Speak error: ${error.message}`);
            console.error("Speak error:", error);
        }
    }

    async closeSession() {
        if (!this.sessionInfo) {
            this.updateStatus('No active session');
            return;
        }

        this.updateStatus('Closing session...');
        
        try {
            // Close HeyGen session
            const closeResponse = await fetch(`${this.AWS_API_URL}/heygen/close`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                mode: 'cors',
                body: JSON.stringify({
                    session_id: this.sessionInfo.session_id,
                    session_token: this.sessionToken
                })
            });
            
            const closeData = await closeResponse.json();
            console.log("Close session response:", closeData);
            
            // Disconnect LiveKit
            if (this.room) {
                await this.room.disconnect();
                this.room = null;
            }
            
            // Reset state
            this.sessionInfo = null;
            this.sessionToken = null;
            this.mediaStream = null;
            
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

