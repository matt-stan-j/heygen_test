class HeyGenAWS {
    constructor() {
        this.room = null;
        this.chatSessionId = this.generateUUID();
        this.avatarReady = false;
        
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

    async fetchSessionData() {
        try {
            const response = await fetch(`${this.AWS_API_URL}/heygen/create`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                mode: 'cors',
                body: JSON.stringify({
                    avatar_name: document.getElementById('avatarID').value || 'Wayne_20240711'
                })
            });
            
            const data = await response.json();
            console.log("Session data:", data);
            return data;
        } catch (error) {
            console.error("Error fetching session data:", error);
            throw error;
        }
    }

    async startSession() {
        try {
            this.updateStatus('Creating streaming session...');
            document.getElementById('startBtn').disabled = true;
            this.avatarReady = false;
            
            // Get session data from backend
            const sessionResponse = await this.fetchSessionData();
            
            if (sessionResponse.session_data && sessionResponse.session_data.sdp) {
                this.updateStatus('Setting up WebRTC connection...');
                this.accessToken = sessionResponse.access_token;
                await this.setupWebRTC(sessionResponse.session_data.sdp, sessionResponse.session_data.ice_servers);
                this.avatarReady = true;
                this.updateStatus('Avatar ready for conversation!');
            } else {
                throw new Error('Failed to get session data from backend');
            }

        } catch (error) {
            document.getElementById('startBtn').disabled = false;
            this.updateStatus(`Error: ${error.message}`);
            console.error("Start session error:", error);
        }
    }
    
    async setupWebRTC(remoteSdp, iceServers) {
        this.pc = new RTCPeerConnection({ iceServers });
        
        this.pc.ontrack = (event) => {
            console.log('Received track:', event.track.kind);
            if (event.track.kind === 'video') {
                const mediaElement = document.getElementById('mediaElement');
                mediaElement.srcObject = event.streams[0];
            }
        };
        
        await this.pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp });
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        
        // Send answer back to HeyGen
        // This would typically be done through their API
        console.log('Local SDP answer:', answer.sdp);
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

            // Send speak command via backend
            if (this.avatarReady && botMessage) {
                const speakResponse = await fetch(`${this.AWS_API_URL}/heygen/speak`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Origin': window.location.origin
                    },
                    mode: 'cors',
                    body: JSON.stringify({
                        access_token: this.accessToken,
                        text: botMessage
                    })
                });
                
                const speakResult = await speakResponse.json();
                console.log('Speak result:', speakResult);
            }

        } catch (error) {
            this.updateStatus(`AI error: ${error.message}`);
            console.error("AI error:", error);
        }
    }

    async closeSession() {
        if (!this.avatarReady) {
            this.updateStatus('No active session');
            return;
        }

        this.updateStatus('Closing session...');
        
        try {
            // Close WebRTC connection
            if (this.pc) {
                this.pc.close();
                this.pc = null;
            }
            
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
