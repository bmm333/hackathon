/**
 * RemixSession - Real-time collaborative session handler
 * Integrates with existing platform via Socket.io
 */
export class RemixSession {
    constructor(sessionId) {
        this.sessionId = sessionId || this._generateSessionId();
        this.participants = new Map();
        this.state = {
            timeline: [],
            activeFilters: {},
            clipIds: [],
            version: 0
        };

        console.log('🌟 Competition Feature: Real-time Remix Collaboration');
        this._initializeSocket();
    }

    _generateSessionId() {
        return `remix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    _initializeSocket() {
        // Initialize Socket.io connection
        this.socket = io('/remix-session', {
            transports: ['websocket'],
            query: { sessionId: this.sessionId }
        });

        this.socket.on('connect', () => {
            console.log(`Connected to remix session: ${this.sessionId}`);
            this._registerSocketEvents();
        });

        this.socket.on('connect_error', (error) => {
            console.warn('Remix session connection error:', error);
            // Fallback to local-only mode
            this._enableOfflineMode();
        });
    }

    _registerSocketEvents() {
        this.socket.on('participant:join', (user) => {
            this.participants.set(user.id, user);
            this._updateParticipantsList();
            this._notifyStateChange();
        });

        this.socket.on('participant:leave', (userId) => {
            this.participants.delete(userId);
            this._updateParticipantsList();
        });

        this.socket.on('participant:cursor', (data) => {
            if (this.participants.has(data.userId)) {
                const user = this.participants.get(data.userId);
                user.cursor = data.position;
                this._updateCursorPosition(user);
            }
        });

        this.socket.on('state:update', (newState) => {
            // Only update if version is newer
            if (newState.version > this.state.version) {
                this.state = newState;
                this._applyStateUpdate();
            }
        });

        this.socket.on('filter:change', (filterData) => {
            this._updateFilterSettings(filterData);
        });
    }

    _enableOfflineMode() {
        console.log('Enabling offline mode for remix studio');
        // Create mock participant (self)
        this.participants.set('self', {
            id: 'self',
            name: 'You',
            avatar: '/assets/avatars/default.png',
            isOffline: true
        });

        this._updateParticipantsList();
    }

    _updateParticipantsList() {
        const participantsContainer = document.querySelector('.remix-participants');
        if (!participantsContainer) return;

        participantsContainer.innerHTML = '';

        this.participants.forEach(user => {
            const participant = document.createElement('div');
            participant.className = 'remix-participant';
            participant.dataset.userId = user.id;

            participant.innerHTML = `
        <div class="remix-participant__avatar" style="background-image: url(${user.avatar})">
          ${user.isOffline ? '<span class="remix-participant__offline"></span>' : ''}
        </div>
        <span class="remix-participant__name">${user.name}</span>
      `;

            participantsContainer.appendChild(participant);
        });

        // Update analytics
        AnalyticsProcessor.trackCollaborationEvent({
            participants: Array.from(this.participants.values()).map(p => p.id),
            duration: (Date.now() - this._sessionStartTime) / 1000,
            filters: Object.keys(this.state.activeFilters)
        });
    }

    _updateCursorPosition(user) {
        let cursor = document.querySelector(`.remix-cursor[data-user-id="${user.id}"]`);

        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'remix-cursor';
            cursor.dataset.userId = user.id;

            cursor.innerHTML = `
        <div class="remix-cursor__pointer"></div>
        <div class="remix-cursor__label">${user.name}</div>
      `;

            document.querySelector('.remix-studio__canvas').appendChild(cursor);
        }

        // Apply cursor position with transform for better performance
        cursor.style.transform = `translate(${user.cursor.x}px, ${user.cursor.y}px)`;
    }

    _applyStateUpdate() {
        // Update timeline UI
        this._updateTimeline();

        // Update active filters
        Object.entries(this.state.activeFilters).forEach(([filterId, settings]) => {
            this.filterPipeline.updateFilter(filterId, settings);
        });

        // Update clip selection
        this._updateClipSelection();
    }

    _updateTimeline() {
        const timeline = document.querySelector('.remix-timeline');
        if (!timeline) return;

        // Render timeline based on state
        timeline.innerHTML = '';

        this.state.timeline.forEach((item, index) => {
            const timelineItem = document.createElement('div');
            timelineItem.className = 'remix-timeline__item';
            timelineItem.dataset.clipId = item.clipId;
            timelineItem.style.left = `${item.startTime / this.state.duration * 100}%`;
            timelineItem.style.width = `${item.duration / this.state.duration * 100}%`;

            timeline.appendChild(timelineItem);
        });
    }

    _updateFilterSettings(filterData) {
        this.state.activeFilters[filterData.id] = filterData.settings;
        this.filterPipeline.updateFilter(filterData.id, filterData.settings);
    }

    _updateClipSelection() {
        // Update clip selection in UI
        document.querySelectorAll('.clip').forEach(clip => {
            const isSelected = this.state.clipIds.includes(clip.dataset.clipId);
            clip.classList.toggle('remix-selected', isSelected);
        });
    }

    _notifyStateChange() {
        this.socket.emit('state:update', this.state);
    }

    // Public methods
    attachFilterPipeline(filterPipeline) {
        this.filterPipeline = filterPipeline;
    }

    updateCursorPosition(x, y) {
        if (!this.socket || !this.socket.connected) return;

        this.socket.emit('participant:cursor', { x, y });
    }

    addClip(clipId) {
        this.state.clipIds.push(clipId);
        this.state.version++;

        // Update timeline logic
        this._notifyStateChange();
    }

    updateFilter(filterId, settings) {
        this.state.activeFilters[filterId] = settings;
        this.state.version++;

        this.socket.emit('filter:change', {
            id: filterId,
            settings
        });
    }
    /**
     * Send a filter update to all participants
     * @param {String} filterName - Name of the filter
     * @param {Object} filterParams - Filter parameters
     * @param {Boolean} enabled - Whether the filter is enabled
     */
    sendFilterUpdate(filterName, filterParams, enabled = true) {
        const filterData = {
            name: filterName,
            params: filterParams,
            enabled: enabled,
            userId: this.socket.id, // Include sender's ID
            timestamp: Date.now()
        };

        // Update local state
        if (!this.state.activeFilters) {
            this.state.activeFilters = {};
        }

        if (enabled) {
            this.state.activeFilters[filterName] = filterParams;
        } else {
            delete this.state.activeFilters[filterName];
        }

        this.state.version++;

        // Send to other participants
        if (this.socket && this.socket.connected) {
            this.socket.emit('filter:change', filterData);
        }

        // Call the callback if defined
        if (this.callbacks && typeof this.callbacks.onFilterApplied === 'function') {
            this.callbacks.onFilterApplied(filterData);
        }
    }

    /**
     * Handle incoming filter update from another participant
     * @param {Object} filterData - Filter data from another participant
     * @private
     */
    _updateFilterSettings(filterData) {
        // Update local state
        if (!this.state.activeFilters) {
            this.state.activeFilters = {};
        }

        if (filterData.enabled) {
            this.state.activeFilters[filterData.name] = filterData.params;
        } else {
            delete this.state.activeFilters[filterData.name];
        }

        // Notify application about filter change
        if (this.callbacks && typeof this.callbacks.onFilterApplied === 'function') {
            this.callbacks.onFilterApplied(filterData);
        }
    }

    /**
     * Register callbacks for session events
     * @param {Object} callbacks - Callback functions
     */
    registerCallbacks(callbacks) {
        this.callbacks = callbacks;
    }

    startSession(initialClips = []) {
        this._sessionStartTime = Date.now();
        this.state.clipIds = initialClips;
        this._notifyStateChange();

        return this.sessionId;
    }

    endSession() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}