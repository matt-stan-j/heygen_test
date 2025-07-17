class HeyGenAWS {
    constructor() {
        this.sessionInfo = null;
        this.room = null;
        this.mediaStream = null;
        this.sessionToken = null;
        this.chatSessionId = this.generateUUID();
        
        // Replace with your API Gateway URL from the test
        this.AWS_API_URL = 'https://x4p585jeee.execute-api.ap-southeast-1.amazonaws.com/prod';
        
        this.initializeEventListeners();
        this.updateStatus('Ready to start');
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
    }

    async startSession() {
        try {
            this.updateStatus('Creating HeyGen session...');
            document.getElementById('startBtn').disabled = true;
            
            // Call AWS Lambda to create HeyGen session
            const response = await fetch(`${this.AWS_API_URL}/heygen/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    avatar_name: document.getElementById('avatarID').value,
                    voice_id: document.getElementById('voiceID').value
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            this.sessionInfo = data.session_info;
            this.sessionToken = data.session_token;
            this.updateStatus(`Session created: ${this.sessionInfo.session_id}`);

            await this.setupLiveKit();
            await this.startStreaming();
            
            this.updateStatus('Avatar ready!');

        } catch (error) {
            document.getElementById('startBtn').disabled = false;
            this.updateStatus(`Error: ${error.message}`);
        }
    }

    async setupLiveKit() {
        this.updateStatus('Setting up LiveKit connection...');
        
        this.room = new LivekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
            videoCaptureDefaults: {
                resolution: LivekitClient.VideoPresets.h720.resolution,
            },
        });

        this.mediaStream = new MediaStream();
        
        this.room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
            if (track.kind === 'video' || track.kind === 'audio') {
                this.mediaStream.addTrack(track.mediaStreamTrack);
                if (this.mediaStream.getVideoTracks().length > 0 && 
                    this.mediaStream.getAudioTracks().length > 0) {
                    document.getElementById('mediaElement').srcObject = this.mediaStream;
                    this.updateStatus('Video stream connected');
                }
            }
        });

        await this.room.prepareConnection(this.sessionInfo.url, this.sessionInfo.access_token);
        this.updateStatus('LiveKit connection prepared');
    }

    async startStreaming() {
        this.updateStatus('Starting streaming...');
        
        // Start streaming via AWS Lambda
        await fetch(`${this.AWS_API_URL}/heygen/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: this.sessionInfo.session_id,
                session_token: this.sessionToken
            })
        });

        await this.room.connect(this.sessionInfo.url, this.sessionInfo.access_token);
        this.updateStatus('Streaming started');
    }

    async sendToAI() {
        const input = document.getElementById('taskInput');
        const message = input.value.trim();
        if (!message) return;

        this.updateStatus(`You: ${message}`);
        input.value = '';

        try {
            // Send to your AI backend
            const aiResponse = await fetch(`${this.AWS_API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: message,
                    session_id: this.chatSessionId
                })
            });

            const aiData = await aiResponse.json();
            const botMessage = aiData.message || 'No response';
            
            this.updateStatus(`AI: ${botMessage}`);

            // Make avatar speak the AI response
            if (this.sessionInfo) {
                await this.makeAvatarSpeak(botMessage);
            }

        } catch (error) {
            this.updateStatus(`Error: ${error.message}`);
        }
    }

    async makeAvatarSpeak(text) {
        this.updateStatus('Avatar speaking...');
        
        await fetch(`${this.AWS_API_URL}/heygen/speak`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: this.sessionInfo.session_id,
                session_token: this.sessionToken,
                text: text
            })
        });
    }

    async closeSession() {
        if (!this.sessionInfo) {
            this.updateStatus('No active session');
            return;
        }

        this.updateStatus('Closing session...');
        
        try {
            await fetch(`${this.AWS_API_URL}/heygen/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: this.sessionInfo.session_id,
                    session_token: this.sessionToken
                })
            });

            if (this.room) {
                this.room.disconnect();
            }

            document.getElementById('mediaElement').srcObject = null;
            document.getElementById('startBtn').disabled = false;
            this.sessionInfo = null;
            this.updateStatus('Session closed');
        } catch (error) {
            this.updateStatus(`Error closing session: ${error.message}`);
        }
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.heygenAWS = new HeyGenAWS();
});
