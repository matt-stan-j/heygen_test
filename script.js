class HeyGenAWS {
    constructor() {
        this.sessionInfo = null;
        this.room = null;
        this.mediaStream = null;
        this.sessionToken = null;
        this.chatSessionId = this.generateUUID();
        
        // Your API Gateway URL
        this.AWS_API_URL = 'https://YOUR-API-ID.execute-api.YOUR-REGION.amazonaws.com/prod';
        
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
        
        try {
            // Configure LiveKit room with proper options
            this.room = new LivekitClient.Room({
                adaptiveStream: true,
                dynacast: true,
                videoCaptureDefaults: {
                    resolution: LivekitClient.VideoPresets.h720.resolution,
                },
                // Add these options to improve WebRTC stability
                rtcConfig: {
                    iceTransportPolicy: 'all',
                    bundlePolicy: 'max-bundle',
                    sdpSemantics: 'unified-plan'
                }
            });

            this.mediaStream = new MediaStream();
            
            // Handle track subscription
            this.room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
                this.updateStatus(`Track subscribed: ${track.kind} from ${participant.identity}`);
                
                if (track.kind === 'video' || track.kind === 'audio') {
                    this.mediaStream.addTrack(track.mediaStreamTrack);
                    
                    // Check if we have both audio and video
                    if (this.mediaStream.getVideoTracks().length > 0) {
                        document.getElementById('mediaElement').srcObject = this.mediaStream;
                        this.updateStatus('Video stream connected');
                    }
                }
            });
            
            // Handle connection state changes
            this.room.on(LivekitClient.RoomEvent.ConnectionStateChanged, (state) => {
                this.updateStatus(`Connection state: ${state}`);
            });
            
            // Handle disconnection
            this.room.on(LivekitClient.RoomEvent.Disconnected, () => {
                this.updateStatus('Disconnected from LiveKit room');
            });
            
            // Handle errors
            this.room.on(LivekitClient.RoomEvent.ConnectionQualityChanged, (quality) => {
                this.updateStatus(`Connection quality: ${quality}`);
            });

            await this.room.prepareConnection(this.sessionInfo.url, this.sessionInfo.access_token);
            this.updateStatus('LiveKit connection prepared');
            
        } catch (error) {
            this.updateStatus(`LiveKit setup error: ${error.message}`);
            throw error;
        }
    }

    async startStreaming() {
        this.updateStatus('Starting streaming...');
        
        try {
            // Start streaming via AWS Lambda
            const startResponse = await fetch(`${this.AWS_API_URL}/heygen/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: this.sessionInfo.session_id,
                    session_token: this.sessionToken
                })
            });
            
            if (!startResponse.ok) {
                const errorData = await startResponse.json();
                throw new Error(errorData.error || 'Failed to start streaming');
            }

            // Connect to LiveKit room with proper options
            await this.room.connect(this.sessionInfo.url, this.sessionInfo.access_token, {
                autoSubscribe: true
            });
            
            this.updateStatus('Streaming started');
        } catch (error) {
            this.updateStatus(`Streaming error: ${error.message}`);
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
        
        try {
            const speakResponse = await fetch(`${this.AWS_API_URL}/heygen/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: this.sessionInfo.session_id,
                    session_token: this.sessionToken,
                    text: text
                })
            });
            
            if (!speakResponse.ok) {
                const errorData = await speakResponse.json();
                throw new Error(errorData.error || 'Failed to make avatar speak');
            }
            
            this.updateStatus('Avatar speaking request sent');
        } catch (error) {
            this.updateStatus(`Speak error: ${error.message}`);
        }
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
