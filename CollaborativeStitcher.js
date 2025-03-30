// CollaborativeStitcher.js
import { RemixSession } from './RemixSession.js';
import { WebGLFilterPipeline } from './WebGLFilterPipeline.js';

/**
 * CollaborativeStitcher extends the ClipStitcher to add real-time
 * collaborative features for multi-user remixing sessions.
 */
export class CollaborativeStitcher {
    /**
     * Create a new collaborative stitcher instance
     * @param {Object} options - Configuration options
     * @param {String} options.sessionId - Optional session ID to join (creates new if not provided)
     */
    constructor(options = {}) {
        this.options = {
            sessionId: options.sessionId || this._generateSessionId(),
            username: options.username || 'User' + Math.floor(Math.random() * 1000),
            maxParticipants: options.maxParticipants || 4,
            autoSave: options.autoSave !== undefined ? options.autoSave : true,
        };

        this.participants = [];
        this.clips = [];
        this.activeFilters = [];
        this.currentState = 'initialized';
        this.remixStudioElement = null;

        // Initialize WebGL filter system
        this.filterPipeline = null;

        // Initialize messaging session
        this.session = new RemixSession({
            sessionId: this.options.sessionId,
            username: this.options.username,
            onParticipantJoin: this._handleParticipantJoin.bind(this),
            onParticipantLeave: this._handleParticipantLeave.bind(this),
            onClipAdded: this._handleClipAdded.bind(this),
            onFilterApplied: this._handleFilterApplied.bind(this),
            onStateChange: this._handleStateChange.bind(this)
        });

        // Event listeners
        this._boundHandleWindowResize = this._handleWindowResize.bind(this);
        window.addEventListener('resize', this._boundHandleWindowResize);

        console.log(`CollaborativeStitcher initialized with session ID: ${this.options.sessionId}`);
    }

    /**
     * Start a new remix session with optional initial clips
     * @param {Array} initialClipIds - Array of clip IDs to start with
     * @returns {Promise} - Resolves when session is ready
     */
    async startRemixSession(initialClipIds = []) {
        try {
            console.log('Starting remix session...');

            // Create UI elements
            this._createRemixStudioUI();

            // Initialize WebGL pipeline with the canvas
            const canvas = document.getElementById('remix-preview-canvas');
            this.filterPipeline = new WebGLFilterPipeline(canvas);

            // Add initial clips if provided
            if (initialClipIds && initialClipIds.length) {
                for (const clipId of initialClipIds) {
                    await this.addClip(clipId);
                }
            }

            // Connect to session
            await this.session.connect();

            // Update state
            this.currentState = 'active';
            this._updateUIState();

            return {
                sessionId: this.options.sessionId,
                status: 'active'
            };
        } catch (error) {
            console.error('Failed to start remix session:', error);
            this._showError('Failed to start remix session');
            throw error;
        }
    }

    /**
     * Add a clip to the remix session
     * @param {String} clipId - ID of the clip to add
     * @returns {Promise} - Resolves when clip is added
     */
    async addClip(clipId) {
        try {
            console.log(`Adding clip ${clipId} to remix session`);

            // Fetch clip data (simulated here)
            const clipData = await this._fetchClipData(clipId);

            // Add clip to local collection
            this.clips.push(clipData);

            // Update timeline UI
            this._updateTimelineUI();

            // Notify other participants
            this.session.sendMessage({
                type: 'clipAdded',
                clipId: clipId,
                clipData: clipData
            });

            return clipData;
        } catch (error) {
            console.error(`Failed to add clip ${clipId}:`, error);
            this._showError(`Failed to add clip ${clipId}`);
            throw error;
        }
    }

    /**
     * Apply a filter to the current remix
     * @param {Object} filterOptions - Filter configuration
     * @param {String} filterOptions.type - Type of filter
     * @param {Object} filterOptions.params - Filter parameters
     */
    applyFilter(filterOptions) {
        try {
            console.log(`Applying filter: ${filterOptions.type}`);

            // Store filter in active filters
            this.activeFilters.push({
                id: `filter-${Date.now()}`,
                type: filterOptions.type,
                params: filterOptions.params,
                appliedBy: this.options.username,
                timestamp: new Date()
            });

            // Apply filter using WebGL pipeline
            this.filterPipeline.applyFilter(filterOptions.type, filterOptions.params);

            // Update filter UI
            this._updateFilterUI();

            // Notify other participants
            this.session.sendMessage({
                type: 'filterApplied',
                filterOptions: filterOptions
            });

            // Update preview
            this._updatePreview();
        } catch (error) {
            console.error('Failed to apply filter:', error);
            this._showError(`Failed to apply filter: ${filterOptions.type}`);
        }
    }

    /**
     * End the current remix session
     * @param {Boolean} saveResult - Whether to save the final result
     * @returns {Promise} - Resolves with the final result URL if saved
     */
    async endSession(saveResult = true) {
        try {
            console.log('Ending remix session...');

            // Save final result if requested
            let finalUrl = null;
            if (saveResult && this.options.autoSave) {
                finalUrl = await this._saveRemixResult();
            }

            // Disconnect session
            await this.session.disconnect();

            // Clean up resources
            this.filterPipeline.dispose();
            window.removeEventListener('resize', this._boundHandleWindowResize);

            // Remove UI
            if (this.remixStudioElement) {
                this.remixStudioElement.remove();
                this.remixStudioElement = null;
            }

            // Update state
            this.currentState = 'ended';

            return {
                status: 'ended',
                finalUrl: finalUrl,
                duration: (new Date() - this.session.startTime) / 1000 // duration in seconds
            };
        } catch (error) {
            console.error('Error ending remix session:', error);
            this._showError('Failed to end remix session properly');
            throw error;
        }
    }

    /**
     * Generate a unique session ID
     * @private
     * @returns {String} - Generated session ID
     */
    _generateSessionId() {
        return 'remix-' + Math.random().toString(36).substring(2, 9);
    }

    /**
     * Create the UI elements for the remix studio
     * @private
     */
    _createRemixStudioUI() {
        // Create container
        const studioElement = document.createElement('div');
        studioElement.className = 'remix-studio';
        studioElement.id = 'remix-studio-container';

        // Create sections
        studioElement.innerHTML = `
      <div class="remix-header">
        <h3>Collaborative Remix Studio</h3>
        <div class="remix-session-info">Session: ${this.options.sessionId}</div>
        <button class="remix-close-btn">Close</button>
      </div>
      
      <div class="remix-participants" id="remix-participants">
        <div class="remix-participant remix-participant--current">
          <div class="remix-participant__avatar">👤</div>
          <div class="remix-participant__name">${this.options.username} (You)</div>
        </div>
      </div>
      
      <div class="remix-preview" id="remix-preview">
        <canvas id="remix-preview-canvas" width="640" height="360"></canvas>
        <div class="remix-visualizer" id="remix-visualizer"></div>
        <div class="remix-controls">
          <button class="remix-control-btn" data-action="play">Play</button>
          <button class="remix-control-btn" data-action="pause">Pause</button>
        </div>
      </div>
      
      <div class="remix-timeline" id="remix-timeline">
        <div class="remix-timeline-clips"></div>
        <div class="remix-timeline-playhead"></div>
      </div>
      
      <div class="remix-filters" id="remix-filters">
        <div class="remix-filter-item" data-filter="blur">
          <div class="remix-filter-item__icon">🌫️</div>
          <div class="remix-filter-item__name">Blur</div>
        </div>
        <div class="remix-filter-item" data-filter="colorize">
          <div class="remix-filter-item__icon">🎨</div>
          <div class="remix-filter-item__name">Colorize</div>
        </div>
        <div class="remix-filter-item" data-filter="vhs">
          <div class="remix-filter-item__icon">📼</div>
          <div class="remix-filter-item__name">VHS</div>
        </div>
        <div class="remix-filter-item" data-filter="glitch">
          <div class="remix-filter-item__icon">⚡</div>
          <div class="remix-filter-item__name">Glitch</div>
        </div>
        <div class="remix-filter-item" data-filter="pixelate">
          <div class="remix-filter-item__icon">🔳</div>
          <div class="remix-filter-item__name">Pixelate</div>
        </div>
        <div class="remix-filter-item" data-filter="reverb">
          <div class="remix-filter-item__icon">🔊</div>
          <div class="remix-filter-item__name">Reverb</div>
        </div>
      </div>
    `;

        // Add to document
        document.body.appendChild(studioElement);
        this.remixStudioElement = studioElement;

        // Set up event listeners
        this._setupUIEventListeners();
    }

    /**
     * Set up event listeners for UI elements
     * @private
     */
    _setupUIEventListeners() {
        // Close button
        const closeBtn = this.remixStudioElement.querySelector('.remix-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.endSession());
        }

        // Filter items
        const filterItems = this.remixStudioElement.querySelectorAll('.remix-filter-item');
        filterItems.forEach(item => {
            item.addEventListener('click', () => {
                const filterType = item.dataset.filter;
                this.applyFilter({
                    type: filterType,
                    params: this._getDefaultFilterParams(filterType)
                });
            });
        });

        // Play/pause buttons
        const playBtn = this.remixStudioElement.querySelector('[data-action="play"]');
        const pauseBtn = this.remixStudioElement.querySelector('[data-action="pause"]');

        if (playBtn) {
            playBtn.addEventListener('click', () => this._playPreview());
        }

        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this._pausePreview());
        }
    }

    /**
     * Update the UI based on current state
     * @private
     */
    _updateUIState() {
        if (!this.remixStudioElement) return;

        // Update status classes
        this.remixStudioElement.classList.remove('remix-studio--loading', 'remix-studio--active', 'remix-studio--error');
        this.remixStudioElement.classList.add(`remix-studio--${this.currentState}`);

        // Update visualizer
        const visualizer = document.getElementById('remix-visualizer');
        if (visualizer) {
            visualizer.className = 'remix-visualizer';

            if (this.currentState === 'active') {
                visualizer.classList.add('remix-visualizer--pulse');
            }
        }
    }

    /**
     * Update the timeline UI with current clips
     * @private
     */
    _updateTimelineUI() {
        const timelineEl = document.querySelector('.remix-timeline-clips');
        if (!timelineEl) return;

        // Clear existing clips
        timelineEl.innerHTML = '';

        // Add clip elements
        this.clips.forEach((clip, index) => {
            const clipEl = document.createElement('div');
            clipEl.className = 'remix-timeline-clip';
            clipEl.style.left = `${index * 120}px`;
            clipEl.style.width = `${clip.duration * 10}px`;
            clipEl.innerHTML = `
        <div class="remix-timeline-clip__label">${clip.title}</div>
        <div class="remix-timeline-clip__duration">${clip.duration}s</div>
      `;

            timelineEl.appendChild(clipEl);
        });
    }

    /**
     * Update the filter UI
     * @private
     */
    _updateFilterUI() {
        const filtersEl = document.getElementById('remix-filters');
        if (!filtersEl) return;

        // Highlight active filters
        const filterItems = filtersEl.querySelectorAll('.remix-filter-item');
        filterItems.forEach(item => {
            const filterType = item.dataset.filter;
            item.classList.remove('remix-filter-item--active');

            if (this.activeFilters.some(f => f.type === filterType)) {
                item.classList.add('remix-filter-item--active');
            }
        });
    }

    /**
     * Update the preview with the current state
     * @private
     */
    _updatePreview() {
        // This would normally render the current state to the canvas
        // using the WebGL pipeline
        this.filterPipeline.render();
    }

    /**
     * Play the preview
     * @private
     */
    _playPreview() {
        console.log('Playing preview');
        this.filterPipeline.play();
    }

    /**
     * Pause the preview
     * @private
     */
    _pausePreview() {
        console.log('Pausing preview');
        this.filterPipeline.pause();
    }

    /**
     * Fetch clip data from server
     * @private
     * @param {String} clipId - ID of clip to fetch
     * @returns {Promise} - Resolves with clip data
     */
    async _fetchClipData(clipId) {
        // In a real app, this would fetch from an API
        // Simulated for demo purposes
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    id: clipId,
                    title: `Clip ${clipId}`,
                    duration: Math.floor(Math.random() * 10) + 5, // 5-15 seconds
                    url: `https://example.com/clips/${clipId}.mp4`,
                    thumbnail: `https://example.com/thumbnails/${clipId}.jpg`,
                    created: new Date()
                });
            }, 200);
        });
    }

    /**
     * Save the final remix result
     * @private
     * @returns {Promise<String>} - Resolves with the URL of the saved remix
     */
    async _saveRemixResult() {
        console.log('Saving remix result...');

        // In a real app, this would save to server
        // Simulated for demo purposes
        return new Promise(resolve => {
            setTimeout(() => {
                const remixId = `remix-${Date.now()}`;
                resolve(`https://example.com/remixes/${remixId}`);
            }, 500);
        });
    }

    /**
     * Handle window resize events
     * @private
     */
    _handleWindowResize() {
        if (this.filterPipeline) {
            this.filterPipeline.resize();
        }
    }

    /**
     * Get default parameters for a filter
     * @private
     * @param {String} filterType - Type of filter
     * @returns {Object} - Default parameters
     */
    _getDefaultFilterParams(filterType) {
        const defaults = {
            blur: { radius: 5 },
            colorize: { hue: 180, saturation: 0.5 },
            vhs: { intensity: 0.7 },
            glitch: { amount: 0.3, speed: 0.5 },
            pixelate: { size: 10 },
            reverb: { roomSize: 0.8, wet: 0.5 }
        };

        return defaults[filterType] || {};
    }

    /**
     * Show error message in UI
     * @private
     * @param {String} message - Error message
     */
    _showError(message) {
        console.error(message);

        // Update UI to show error
        this.currentState = 'error';
        this._updateUIState();

        // Create error notification
        const notification = document.createElement('div');
        notification.className = 'remix-notification remix-notification--error';
        notification.textContent = message;

        // Add to UI
        if (this.remixStudioElement) {
            this.remixStudioElement.appendChild(notification);

            // Auto-remove after a delay
            setTimeout(() => {
                notification.remove();
            }, 5000);
        }
    }

    /**
     * Handle participant joining event
     * @private
     * @param {Object} participant - Participant info
     */
    _handleParticipantJoin(participant) {
        console.log(`Participant joined: ${participant.username}`);

        // Add to participants list
        this.participants.push(participant);

        // Update UI
        const participantsEl = document.getElementById('remix-participants');
        if (participantsEl) {
            const participantEl = document.createElement('div');
            participantEl.className = 'remix-participant';
            participantEl.dataset.userId = participant.id;
            participantEl.innerHTML = `
        <div class="remix-participant__avatar">👤</div>
        <div class="remix-participant__name">${participant.username}</div>
      `;

            participantsEl.appendChild(participantEl);
        }

        // Show notification
        this._showNotification(`${participant.username} joined the session`);
    }

    /**
     * Handle participant leave event
     * @private
     * @param {Object} participant - Participant info
     */
    _handleParticipantLeave(participant) {
        console.log(`Participant left: ${participant.username}`);

        // Remove from participants list
        this.participants = this.participants.filter(p => p.id !== participant.id);

        // Update UI
        const participantEl = document.querySelector(`.remix-participant[data-user-id="${participant.id}"]`);
        if (participantEl) {
            participantEl.remove();
        }

        // Show notification
        this._showNotification(`${participant.username} left the session`);
    }

    /**
     * Handle clip added event
     * @private
     * @param {Object} data - Clip data
     */
    _handleClipAdded(data) {
        console.log(`Clip added by another participant: ${data.clipId}`);

        // Add to clips if not already present
        if (!this.clips.some(clip => clip.id === data.clipId)) {
            this.clips.push(data.clipData);
            this._updateTimelineUI();
            this._updatePreview();
        }
    }

    /**
     * Handle filter applied event
     * @private
     * @param {Object} data - Filter data
     */
    _handleFilterApplied(data) {
        console.log(`Filter applied by another participant: ${data.filterOptions.type}`);

        // Add to active filters
        this.activeFilters.push({
            id: `filter-${Date.now()}`,
            type: data.filterOptions.type,
            params: data.filterOptions.params,
            appliedBy: data.username,
            timestamp: new Date()
        });

        // Apply filter using WebGL pipeline
        this.filterPipeline.applyFilter(data.filterOptions.type, data.filterOptions.params);

        // Update UI
        this._updateFilterUI();
        this._updatePreview();
    }

    /**
     * Handle session state change event
     * @private
     * @param {Object} data - State data
     */
    _handleStateChange(data) {
        console.log(`Session state changed: ${data.state}`);

        // Update state
        this.currentState = data.state;
        this._updateUIState();
    }
    // Add this method to CollaborativeStitcher class
    /**
     * Apply a filter to the current remix
     * @param {String} filterName - Name of the filter to apply
     * @param {Object} params - Filter parameters
     * @param {Boolean} enabled - Whether to enable or disable the filter
     */
    applyFilter(filterName, params, enabled = true) {
        if (!this.filterPipeline) {
            console.warn('Filter pipeline not initialized');
            return;
        }

        // Apply filter locally
        if (enabled) {
            this.filterPipeline.setFilterParams(filterName, params);
            this.filterPipeline.enableFilter(filterName);
        } else {
            this.filterPipeline.disableFilter(filterName);
        }

        // Update active filters list
        this._updateActiveFilters();

        // Send to collaboration session
        this.session.sendFilterUpdate(filterName, params, enabled);
    }

    /**
     * Handle filter applied by another participant
     * @param {Object} filterData - Data about the filter change
     * @private
     */
    _handleFilterApplied(filterData) {
        if (!this.filterPipeline) return;

        // Apply remote filter
        this.filterPipeline.applyRemoteFilterUpdate(filterData);

        // Update UI to reflect the filter change
        this._updateFilterUI(filterData);
    }

    /**
     * Update the filter UI to reflect current state
     * @param {Object} filterData - Optional filter data that triggered the update
     * @private
     */
    _updateFilterUI(filterData) {
        // Update filter controls in the UI
        const filterControls = document.querySelector('.remix-filter-controls');
        if (!filterControls) return;

        // Update active filter indicators
        const filterButtons = filterControls.querySelectorAll('.filter-button');
        filterButtons.forEach(button => {
            const name = button.dataset.filterName;
            if (this.filterPipeline.activeFilters.has(name)) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        // If specific filter data provided, highlight the user who made the change
        if (filterData && filterData.userId && filterData.userId !== 'self') {
            this._showCollaboratorActivity(filterData.userId, `applied ${filterData.name} filter`);
        }
    }
    /**
     * Show notification in UI
     * @private
     * @param {String} message - Notification message
     */
    _showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'remix-notification';
        notification.textContent = message;

        // Add to UI
        if (this.remixStudioElement) {
            this.remixStudioElement.appendChild(notification);

            // Auto-remove after a delay
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
    }
}