/**
 * WebGLFilterPipeline - High-performance filter system
 * Optimized for vertical video platform with worker offloading
 */
export class WebGLFilterPipeline {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
        this.filters = new Map();
        this.activeFilters = new Set();
        this.isWebGLSupported = !!this.gl;
        this.worker = null;

        console.log('🌟 Competition Feature: WebGL Filter Pipeline');

        if (!this.isWebGLSupported) {
            console.warn('WebGL not supported, falling back to CSS filters');
            this._setupCSSFallback();
            return;
        }

        this._initWebGL();
        this._setupWorker();
        this._registerBuiltinFilters();
    }

    _initWebGL() {
        // Initialize WebGL context
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);

        // Create default shader program
        this._createShaderProgram();

        // Set up buffers
        this._setupBuffers();
    }

    _createShaderProgram() {
        // Define shader sources
        const vertexShaderSource = `
      attribute vec4 aVertexPosition;
      attribute vec2 aTextureCoord;
      varying highp vec2 vTextureCoord;
      
      void main() {
        gl_Position = aVertexPosition;
        vTextureCoord = aTextureCoord;
      }
    `;

        const fragmentShaderSource = `
      precision mediump float;
      varying highp vec2 vTextureCoord;
      uniform sampler2D uSampler;
      
      void main() {
        gl_FragColor = texture2D(uSampler, vTextureCoord);
      }
    `;

        // Create shaders
        const vertexShader = this._compileShader(vertexShaderSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this._compileShader(fragmentShaderSource, this.gl.FRAGMENT_SHADER);

        // Create program and link shaders
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Unable to initialize shader program:', this.gl.getProgramInfoLog(this.program));
            this.isWebGLSupported = false;
            this._setupCSSFallback();
            return;
        }

        // Setup program info
        this.programInfo = {
            program: this.program,
            attribLocations: {
                vertexPosition: this.gl.getAttribLocation(this.program, 'aVertexPosition'),
                textureCoord: this.gl.getAttribLocation(this.program, 'aTextureCoord'),
            },
            uniformLocations: {
                uSampler: this.gl.getUniformLocation(this.program, 'uSampler'),
            },
        };
    }

    applyRemoteFilterUpdate(filterData) {
        if (!filterData || !filterData.name) {
            console.warn('Invalid filter data received');
            return;
        }

        const { name, params, enabled = true } = filterData;

        if (!this.filters.has(name)) {
            console.warn(`Filter "${name}" not found in available filters`);
            return;
        }

        // Apply filter settings
        if (enabled) {
            this.activeFilters.add(name);
            this.setFilterParams(name, params);
        } else {
            this.activeFilters.delete(name);
        }

        // Render with updated filter settings
        this.render();

        console.log(`Applied remote filter update: ${name}, enabled: ${enabled}`);
    }

    _compileShader(source, type) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    _setupBuffers() {
        // Create vertex buffer
        const positions = [
            -1.0, -1.0,  // Bottom left
            1.0, -1.0,  // Bottom right
            -1.0,  1.0,  // Top left
            1.0,  1.0,  // Top right
        ];

        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

        // Create texture coordinate buffer
        const textureCoordinates = [
            0.0, 0.0,  // Bottom left
            1.0, 0.0,  // Bottom right
            0.0, 1.0,  // Top left
            1.0, 1.0,  // Top right
        ];

        this.textureCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), this.gl.STATIC_DRAW);

        // Create texture
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);

        // Set texture parameters
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    }

    _setupWorker() {
        // Create Web Worker for offloading heavy computations
        const workerBlob = new Blob([`
      self.onmessage = function(e) {
        const { type, data } = e.data;
        
        if (type === 'process-frame') {
          // Process frame data in worker
          const { imageData, filterId, settings } = data;
          
          // Apply specific filter processing
          let processedData;
          
          switch(filterId) {
            case 'glitch':
              processedData = applyGlitchFilter(imageData, settings);
              break;
            case 'vhs':
              processedData = applyVHSFilter(imageData, settings);
              break;
            case 'rgbShift':
              processedData = applyRGBShift(imageData, settings);
              break;
            // ... more filters
            default:
              processedData = imageData;
          }
          
          self.postMessage({
            type: 'frame-processed',
            data: {
              processedData,
              filterId
            }
          });
        }
      };
      
      // Filter implementation functions
      function applyGlitchFilter(imageData, settings) {
        const { intensity = 0.5, speed = 0.5 } = settings;
        // Simulate glitch processing
        return imageData;
      }
      
      function applyVHSFilter(imageData, settings) {
        const { noise = 0.2, scanlines = 0.5 } = settings;
        // Simulate VHS processing
        return imageData;
      }
      
      function applyRGBShift(imageData, settings) {
        const { amount = 0.5, angle = 0.0 } = settings;
        // Simulate RGB shift processing
        return imageData;
      }
    `], { type: 'application/javascript' });

        const workerUrl = URL.createObjectURL(workerBlob);
        this.worker = new Worker(workerUrl);

        this.worker.onmessage = (e) => {
            const { type, data } = e.data;

            if (type === 'frame-processed') {
                // Handle processed frame data
                this._updateCanvas(data.processedData);
            }
        };

        URL.revokeObjectURL(workerUrl);
    }

    _registerBuiltinFilters() {
        // Register built-in WebGL filters
        this.registerFilter('glitch', {
            fragmentShader: `
        precision mediump float;
        varying highp vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform float uTime;
        uniform float uIntensity;
        
        float rand(vec2 co){
          return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
        }
        
        void main() {
          vec2 texCoord = vTextureCoord;
          
          // Apply glitch effect
          float noise = rand(texCoord * uTime);
          
          if (noise > 0.98) {
            texCoord.x += (rand(vec2(uTime, texCoord.y)) - 0.5) * 0.1 * uIntensity;
          }
          
          if (noise > 0.95) {
            texCoord.y += (rand(vec2(texCoord.x, uTime)) - 0.5) * 0.1 * uIntensity;
          }
          
          // RGB shift
          float r = texture2D(uSampler, texCoord + vec2(0.01, 0.0) * uIntensity).r;
          float g = texture2D(uSampler, texCoord).g;
          float b = texture2D(uSampler, texCoord - vec2(0.01, 0.0) * uIntensity).b;
          
          gl_FragColor = vec4(r, g, b, 1.0);
        }
      `,
            uniforms: {
                uTime: { type: 'float', default: 0.0 },
                uIntensity: { type: 'float', default: 0.5 }
            }
        });

        this.registerFilter('vhs', {
            fragmentShader: `
        precision mediump float;
        varying highp vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform float uTime;
        uniform float uNoise;
        uniform float uScanlines;
        
        float rand(vec2 co){
          return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
        }
        
        void main() {
          vec2 texCoord = vTextureCoord;
          
          // Add scanlines
          float scanline = sin(texCoord.y * 800.0) * 0.04 * uScanlines;
          texCoord.x += sin(texCoord.y * 100.0 + uTime) * 0.001;
          
          vec4 color = texture2D(uSampler, texCoord);
          
          // Add noise
          float noise = rand(texCoord * uTime) * uNoise;
          
          // Adjust color
          color.rgb += vec3(scanline);
          color.rgb += vec3(noise);
          color.rgb = mix(color.rgb, vec3(0.5, 0.5, 1.0) * dot(color.rgb, vec3(0.33)), 0.1);
          
          gl_FragColor = color;
        }
      `,
            uniforms: {
                uTime: { type: 'float', default: 0.0 },
                uNoise: { type: 'float', default: 0.2 },
                uScanlines: { type: 'float', default: 0.5 }
            }
        });

        this.registerFilter('rgbShift', {
            fragmentShader: `
        precision mediump float;
        varying highp vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform float uAmount;
        uniform float uAngle;
        
        void main() {
          vec2 offset = uAmount * vec2(cos(uAngle), sin(uAngle));
          
          float r = texture2D(uSampler, vTextureCoord + offset).r;
          float g = texture2D(uSampler, vTextureCoord).g;
          float b = texture2D(uSampler, vTextureCoord - offset).b;
          
          gl_FragColor = vec4(r, g, b, 1.0);
        }
      `,
            uniforms: {
                uAmount: { type: 'float', default: 0.01 },
                uAngle: { type: 'float', default: 0.0 }
            }
        });

        this.registerFilter('duotone', {
            fragmentShader: `
        precision mediump float;
        varying highp vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform vec3 uLight;
        uniform vec3 uDark;
        
        void main() {
          vec4 color = texture2D(uSampler, vTextureCoord);
          float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
          vec3 duotone = mix(uDark, uLight, luminance);
          gl_FragColor = vec4(duotone, color.a);
        }
      `,
            uniforms: {
                uLight: { type: 'vec3', default: [1.0, 0.8, 0.5] }, // Warm highlight
                uDark: { type: 'vec3', default: [0.2, 0.2, 0.6] }  // Cool shadow
            }
        });

        this.registerFilter('pixelate', {
            fragmentShader: `
        precision mediump float;
        varying highp vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform float uPixelSize;
        uniform vec2 uResolution;
        
        void main() {
          vec2 pixelCoord = floor(vTextureCoord * uResolution / uPixelSize) * uPixelSize / uResolution;
          gl_FragColor = texture2D(uSampler, pixelCoord);
        }
      `,
            uniforms: {
                uPixelSize: { type: 'float', default: 8.0 },
                uResolution: { type: 'vec2', default: [640, 1136] }
            }
        });

        this.registerFilter('neon', {
            fragmentShader: `
        precision mediump float;
        varying highp vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform float uBrightness;
        uniform float uContrast;
        uniform vec3 uGlowColor;
        
        void main() {
          vec4 color = texture2D(uSampler, vTextureCoord);
          
          // Increase contrast
          color.rgb = (color.rgb - 0.5) * uContrast + 0.5 + uBrightness;
          
          // Add neon glow
          float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
          vec3 glow = smoothstep(0.6, 0.9, vec3(luminance)) * uGlowColor;
          
          color.rgb += glow;
          color.rgb = clamp(color.rgb, vec3(0.0), vec3(1.0));
          
          gl_FragColor = color;
        }
      `,
            uniforms: {
                uBrightness: { type: 'float', default: 0.1 },
                uContrast: { type: 'float', default: 1.5 },
                uGlowColor: { type: 'vec3', default: [0.0, 1.0, 1.0] } // Cyan glow
            }
        });
    }

    _setupCSSFallback() {
        // Set up CSS filter fallback
        this.cssFilters = {
            'glitch': (intensity) => `blur(${intensity * 0.5}px) contrast(${1 + intensity}) hue-rotate(${Math.random() * 360}deg)`,
            'vhs': (noise, scanlines) => `brightness(1.1) contrast(1.2) saturate(1.5) sepia(${noise * 0.5})`,
            'rgbShift': (amount) => `saturate(1.5) drop-shadow(${amount * 10}px 0 0 rgba(255,0,0,0.5)) drop-shadow(-${amount * 10}px 0 0 rgba(0,255,255,0.5))`,
            'duotone': () => `contrast(1.5) brightness(1.2) sepia(0.5)`,
            'pixelate': () => `contrast(1.2) brightness(1.1)`, // Limited CSS pixelate fallback
            'neon': (brightness) => `contrast(1.5) brightness(${1 + brightness}) saturate(2)`
        };
    }

    _updateCanvas(imageData) {
        // Update canvas with processed image data
        const ctx = this.canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
    }

    // Public methods
    registerFilter(id, filterConfig) {
        this.filters.set(id, filterConfig);
    }

    applyFilter(filterId, videoElement, settings = {}) {
        if (!this.isWebGLSupported && !this.cssFilters[filterId]) {
            console.warn(`Filter "${filterId}" not available in CSS fallback mode`);
            return false;
        }

        if (this.isWebGLSupported) {
            const filter = this.filters.get(filterId);
            if (!filter) {
                console.warn(`Filter "${filterId}" not found`);
                return false;
            }

            this.activeFilters.add(filterId);

            // Configure filter with settings
            Object.entries(settings).forEach(([key, value]) => {
                if (filter.uniforms[key]) {
                    filter.uniforms[key].value = value;
                }
            });

            // Apply filter to next frame render
            this._renderFrame(videoElement);
        } else {
            // Apply CSS fallback filter
            const cssFilter = this._getCSSFilterString(filterId, settings);
            videoElement.style.filter = cssFilter;
        }

        return true;
    }

    _getCSSFilterString(filterId, settings) {
        const filterFunc = this.cssFilters[filterId];
        if (typeof filterFunc === 'function') {
            return filterFunc(...Object.values(settings));
        }
        return '';
    }

    _renderFrame(videoElement) {
        // Skip if video is not ready
        if (videoElement.readyState < 2) return;

        // Set canvas size to match video
        this.canvas.width = videoElement.videoWidth;
        this.canvas.height = videoElement.videoHeight;

        // Set viewport
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        // Clear canvas
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Update texture with video frame
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, videoElement);

        // Use program
        this.gl.useProgram(this.programInfo.program);

        // Bind position buffer
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);

        // Bind texture coordinates
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);
        this.gl.vertexAttribPointer(this.programInfo.attribLocations.textureCoord, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.programInfo.attribLocations.textureCoord);

        // Set uniforms
        this.gl.uniform1i(this.programInfo.uniformLocations.uSampler, 0);

        // Apply active filters
        // This is a simplified example - a real implementation would chain filter passes

        // Draw
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        // Request next frame
        requestAnimationFrame(() => this._renderFrame(videoElement));
    }

    updateFilter(filterId, settings) {
        if (!this.activeFilters.has(filterId)) return;

        if (this.isWebGLSupported) {
            const filter = this.filters.get(filterId);
            if (!filter) return;

            // Update filter uniforms with new settings
            Object.entries(settings).forEach(([key, value]) => {
                if (filter.uniforms[key]) {
                    filter.uniforms[key].value = value;
                }
            });
        } else {
            // Update CSS fallback filter
            // Implementation depends on how video elements are tracked
        }
    }

    removeFilter(filterId) {
        this.activeFilters.delete(filterId);
    }

    dispose() {
        // Clean up resources
        if (this.worker) {
            this.worker.terminate();
        }

        if (this.gl) {
            // Delete WebGL resources
            this.gl.deleteBuffer(this.positionBuffer);
            this.gl.deleteBuffer(this.textureCoordBuffer);
            this.gl.deleteTexture(this.texture);
            this.gl.deleteProgram(this.program);
        }
    }
}