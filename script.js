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
            const response = await fetch(`${this.AWS_API_URL}/heygen/new`, {
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
                
                // Start the session
                this.updateStatus('Starting session...');
                const startResponse = await fetch(`${this.AWS_API_URL}/heygen/start`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Origin': window.location.origin
                    },
                    mode: 'cors',
                    body: JSON.stringify({ session_id: this.sessionId })
                });
                
                const startData = await startResponse.json();
                console.log('Start data:', startData);
                
                if (startData.data) {
                    this.isSessionActive = true;
                    
                    // Set up WebRTC connection if available
                    if (startData.data.sdp) {
                        await this.setupWebRTC(startData.data);
                    }
                    
                    this.updateStatus('Avatar ready for conversation!');
                } else {
                    throw new Error('Failed to start session');
                }
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
            this.updateStatus('Setting up video connection...');
            
            // Create RTCPeerConnection
            this.pc = new RTCPeerConnection({
                iceServers: sessionData.ice_servers || []
            });
            
            // Handle incoming video stream
            this.pc.ontrack = (event) => {
                console.log('Received track:', event.track.kind);
                if (event.track.kind === 'video') {
                    const videoElement = document.getElementById('videoElement');
                    videoElement.srcObject = event.streams[0];
                    videoElement.play();
                }
            };
            
            // Set remote description
            if (sessionData.sdp) {
                await this.pc.setRemoteDescription({
                    type: 'offer',
                    sdp: sessionData.sdp
                });
                
                // Create and set local description
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                
                this.updateStatus('WebRTC connection established');
            }
            
        } catch (error) {
            console.error('WebRTC setup error:', error);
            this.updateStatus('WebRTC setup failed, but session is active');
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
                this.updateStatus('Avatar is speaking...');
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
            
            // Clean up
            if (this.pc) {
                this.pc.close();
                this.pc = null;
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
