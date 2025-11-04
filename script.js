class HeyGenAvatarApp {
    constructor() {
        this.sessionId = null;
        this.isSessionActive = false;
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
        document.getElementById('startBtn').onclick = () => this.startSession();
        document.getElementById('closeBtn').onclick = () => this.stopSession();
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
            
            // Create new session via AWS backend
            const response = await fetch(`${this.AWS_API_URL}/heygen/create`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                mode: 'cors'
            });
            
            const sessionData = await response.json();
            console.log("Session data:", sessionData);
            
            if (sessionData.data && sessionData.data.session_id) {
                this.sessionId = sessionData.data.session_id;
                this.updateStatus(`Session created! ID: ${this.sessionId}`);
                
                // Start the session to put it in correct state
                this.updateStatus('Starting session...');
                const startResponse = await fetch(`${this.AWS_API_URL}/heygen/create`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Origin': window.location.origin
                    },
                    mode: 'cors',
                    body: JSON.stringify({ 
                        action: 'start',
                        session_id: this.sessionId 
                    })
                });
                
                const startData = await startResponse.json();
                console.log('Start data:', startData);
                
                this.isSessionActive = true;
                
                // Set up WebRTC connection if available
                if (sessionData.data.url) {
                    await this.setupWebRTC(sessionData.data);
                }
                
                this.updateStatus('Avatar ready for conversation!');
            } else {
                throw new Error('Failed to create session');
            }
            
        } catch (error) {
            document.getElementById('startBtn').disabled = false;
            this.updateStatus(`Error: ${error.message}`);
            console.error("Start session error:", error);
        }
    }

    async setupWebRTC(sessionData) {
        try {
            this.updateStatus('Setting up LiveKit connection...');
            
            console.log('LiveKit URL:', sessionData.url);
            console.log('Access Token:', sessionData.access_token?.substring(0, 20) + '...');
            
            // Check if LiveKit is available
            if (typeof LivekitClient === 'undefined') {
                throw new Error('LiveKit client not loaded');
            }
            
            // Create LiveKit Room using official method
            this.room = new LivekitClient.Room({
                adaptiveStream: true,
                dynacast: true,
                videoCaptureDefaults: {
                    resolution: LivekitClient.VideoPresets.h720.resolution,
                },
            });
            
            // Handle media streams
            this.mediaStream = new MediaStream();
            const videoElement = document.getElementById('videoElement');
            
            this.room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
                console.log('Track subscribed:', track.kind);
                if (track.kind === 'video' || track.kind === 'audio') {
                    this.mediaStream.addTrack(track.mediaStreamTrack);
                    if (this.mediaStream.getVideoTracks().length > 0) {
                        videoElement.srcObject = this.mediaStream;
                        this.updateStatus('Avatar video connected!');
                    }
                }
            });
            
            this.room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
                const mediaTrack = track.mediaStreamTrack;
                if (mediaTrack) {
                    this.mediaStream.removeTrack(mediaTrack);
                }
            });
            
            this.room.on(LivekitClient.RoomEvent.Connected, () => {
                console.log('Connected to LiveKit room');
                this.updateStatus('Connected to avatar room');
            });
            
            this.room.on(LivekitClient.RoomEvent.Disconnected, (reason) => {
                console.log('Disconnected from LiveKit room:', reason);
                this.updateStatus(`Disconnected: ${reason}`);
            });
            
            // Connect to the room
            await this.room.connect(sessionData.url, sessionData.access_token);
            this.updateStatus('LiveKit connection established!');
            
            // Set up WebSocket for avatar events
            this.setupWebSocket(sessionData);
            
        } catch (error) {
            console.error('LiveKit connection error:', error);
            this.updateStatus('Video connection failed, but audio should work');
            
            // Show fallback placeholder
            const videoElement = document.getElementById('videoElement');
            videoElement.style.backgroundColor = '#1e40af';
            videoElement.style.display = 'flex';
            videoElement.style.alignItems = 'center';
            videoElement.style.justifyContent = 'center';
            videoElement.style.color = 'white';
            videoElement.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 48px; margin-bottom: 10px;">🤖</div>
                    <div>HeyGen Avatar Active</div>
                    <div style="font-size: 14px; margin-top: 10px; opacity: 0.8;">Session: ${this.sessionId.substring(0, 8)}...</div>
                    <div id="speakingIndicator" style="font-size: 14px; margin-top: 10px; opacity: 0;">🎤 Speaking...</div>
                </div>
            `;
        }
    }

    setupWebSocket(sessionData) {
        try {
            // Create WebSocket connection to monitor avatar events
            const wsUrl = `wss://api.heygen.com/v1/ws/streaming.chat?session_id=${this.sessionId}&session_token=${sessionData.access_token}&silence_response=false`;
            
            this.webSocket = new WebSocket(wsUrl);
            
            this.webSocket.onopen = () => {
                console.log('WebSocket connected');
                this.updateStatus('Avatar WebSocket connected');
            };
            
            this.webSocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log('Avatar event:', data);
                
                if (data.type === 'avatar_start_talking') {
                    this.updateStatus('🎤 Avatar started talking');
                } else if (data.type === 'avatar_stop_talking') {
                    this.updateStatus('🔇 Avatar stopped talking');
                }
            };
            
            this.webSocket.onerror = (error) => {
                console.log('WebSocket error:', error);
            };
            
        } catch (error) {
            console.log('WebSocket setup failed:', error);
        }
    }

    async sendToAI() {
        const input = document.getElementById('taskInput');
        const message = input.value.trim();
        if (!message) return;

        if (!this.isSessionActive) {
            this.updateStatus('No active session, please start first');
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

            // Send speak task to HeyGen
            if (this.sessionId && botMessage) {
                this.updateStatus('Sending to avatar...');
                
                const speakResponse = await fetch(`${this.AWS_API_URL}/heygen/speak`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Origin': window.location.origin
                    },
                    mode: 'cors',
                    body: JSON.stringify({
                        session_id: this.sessionId,
                        text: botMessage
                    })
                });
                
                const speakResult = await speakResponse.json();
                console.log('Speak result:', speakResult);
                
                if (speakResult.code === 100) {
                    this.updateStatus('Avatar is speaking...');
                    if (speakResult.data && speakResult.data.task_id) {
                        this.updateStatus(`Task ID: ${speakResult.data.task_id}`);
                    }
                } else {
                    this.updateStatus(`Speak failed: ${speakResult.message || 'Unknown error'}`);
                }
                
                // Show speaking indicator
                const indicator = document.getElementById('speakingIndicator');
                if (indicator) {
                    indicator.style.opacity = '1';
                    setTimeout(() => {
                        if (indicator) indicator.style.opacity = '0';
                    }, 3000);
                }
            }

        } catch (error) {
            this.updateStatus(`Error: ${error.message}`);
            console.error("Send to AI error:", error);
        }
    }

    async stopSession() {
        if (!this.sessionId) {
            this.updateStatus('No active session');
            return;
        }

        this.updateStatus('Stopping session...');
        
        try {
            // Close session via backend
            const response = await fetch(`${this.AWS_API_URL}/heygen/close`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                mode: 'cors',
                body: JSON.stringify({
                    session_id: this.sessionId
                })
            });
            
            const result = await response.json();
            console.log('Close result:', result);
            
            // Clean up connections
            if (this.webSocket) {
                this.webSocket.close();
                this.webSocket = null;
            }
            
            if (this.room) {
                this.room.disconnect();
                this.room = null;
            }
            
            this.sessionId = null;
            this.isSessionActive = false;
            
            document.getElementById('startBtn').disabled = false;
            document.getElementById('videoElement').srcObject = null;
            
            this.updateStatus('Session stopped');
            
        } catch (error) {
            this.updateStatus(`Stop error: ${error.message}`);
            console.error("Stop session error:", error);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.heygenApp = new HeyGenAvatarApp();
});
