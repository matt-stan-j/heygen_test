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
            
            // Parse the JWT token to get connection details
            const tokenData = JSON.parse(atob(accessToken.split('.')[1]));
            console.log('Token data:', tokenData);
            
            // Connect to LiveKit room
            this.updateStatus('Connecting to LiveKit...');
            this.room = new LiveKit.Room();
            
            // Set up event listeners
            this.room.on(LiveKit.RoomEvent.TrackSubscribed, (track, publication, participant) => {
                console.log('Track subscribed:', track.kind);
                if (track.kind === 'video') {
                    const mediaElement = document.getElementById('mediaElement');
                    track.attach(mediaElement);
                    this.avatarReady = true;
                    this.updateStatus('Avatar ready for conversation!');
                }
            });
            
            this.room.on(LiveKit.RoomEvent.Connected, () => {
                console.log('Connected to room');
                this.updateStatus('Connected to avatar session!');
            });
            
            this.room.on(LiveKit.RoomEvent.Disconnected, () => {
                console.log('Disconnected from room');
                this.updateStatus('Disconnected from session');
                this.avatarReady = false;
            });
            
            // Connect to the room
            await this.room.connect(tokenData.url, accessToken);
            
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

            // Send message to avatar via data channel
            if (this.room && botMessage) {
                const encoder = new TextEncoder();
                const data = encoder.encode(JSON.stringify({
                    type: 'speak',
                    text: botMessage
                }));
                this.room.localParticipant.publishData(data, LiveKit.DataPacket_Kind.RELIABLE);
            }

        } catch (error) {
            this.updateStatus(`AI error: ${error.message}`);
            console.error("AI error:", error);
        }
    }

    async closeSession() {
        if (!this.room) {
            this.updateStatus('No active session');
            return;
        }

        this.updateStatus('Closing session...');
        
        try {
            await this.room.disconnect();
            this.room = null;
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
