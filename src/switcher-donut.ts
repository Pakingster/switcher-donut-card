import { LitElement, html, css, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('switcher-donut-card')
export class SwitcherDonutCard extends LitElement {
  @property({ attribute: false }) hass!: any;
  @state() private config!: any;

  @state() private targetMinutes = 0;
  @state() private isDragging = false;
  @state() private showScheduler = false;
  @state() private scheduleRepeat = 'single';
  @state() private selectedDays: string[] = [];
  @state() private startTime = this.getCurrentTime();
  @state() private endTime = this.getCurrentTimePlus15();
  @state() private scheduleDate = this.getTodayDate();
  @state() private isScheduleSet = false; // Controls if the icon is RED
  @state() private helpersSetup = false; // Track if helpers are initialized
  @state() private setupMessage = ''; // Display setup status
  @state() private showSetupPrompt = false; // Show setup confirmation dialog
  @state() private setupInProgress = false; // Track setup progress
  @state() private lastBoilerState = 'off'; // Track boiler state for timer completion detection

  private getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getCurrentTime(): string {
    const now = new Date();
    return now.toTimeString().slice(0, 5); // HH:MM
  }

  private getCurrentTimePlus15(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    return now.toTimeString().slice(0, 5); // HH:MM
  }

  private async saveSchedule() {
    // Logic: If the user selected at least one day OR set a 'single' time
    if (this.selectedDays.length > 0 || (this.startTime && this.scheduleRepeat === 'single')) {
      this.isScheduleSet = true;
      
      // Save schedule data to Home Assistant helper entities
      try {
        // Save start and end times
        await this.hass.callService('input_datetime', 'set_datetime', {
          entity_id: 'input_datetime.boiler_schedule_start',
          time: this.startTime
        });
        
        await this.hass.callService('input_datetime', 'set_datetime', {
          entity_id: 'input_datetime.boiler_schedule_end',
          time: this.endTime
        });
        
        // Save date for single schedules
        if (this.scheduleRepeat === 'single') {
          await this.hass.callService('input_datetime', 'set_datetime', {
            entity_id: 'input_datetime.boiler_schedule_date',
            date: this.scheduleDate
          });
        }
        
        // Save schedule mode (single/repeat)
        await this.hass.callService('input_select', 'select_option', {
          entity_id: 'input_select.boiler_schedule_mode',
          option: this.scheduleRepeat
        });
        
        // Save selected days
        const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        for (let i = 0; i < 7; i++) {
          const isSelected = this.selectedDays.includes(i.toString());
          await this.hass.callService('input_boolean', isSelected ? 'turn_on' : 'turn_off', {
            entity_id: `input_boolean.boiler_schedule_${dayNames[i]}`
          });
        }
        
        // Enable the schedule
        await this.hass.callService('input_boolean', 'turn_on', {
          entity_id: 'input_boolean.boiler_schedule_enabled'
        });
      } catch (error) {
        console.error('Error saving schedule:', error);
      }
    } else {
      this.isScheduleSet = false;
    }

    // Close the panel, but isScheduleSet stays true!
    this.showScheduler = false;
  }

  private async loadSchedule() {
    try {
      // Check if schedule is enabled
      const scheduleEnabled = this.hass.states['input_boolean.boiler_schedule_enabled'];
      if (scheduleEnabled?.state === 'on') {
        this.isScheduleSet = true;
        
        // Load times
        const startEntity = this.hass.states['input_datetime.boiler_schedule_start'];
        const endEntity = this.hass.states['input_datetime.boiler_schedule_end'];
        if (startEntity) this.startTime = startEntity.state;
        if (endEntity) this.endTime = endEntity.state;
        
        // Load mode
        const modeEntity = this.hass.states['input_select.boiler_schedule_mode'];
        if (modeEntity) this.scheduleRepeat = modeEntity.state as 'single' | 'repeat';
        
        // Load date for single schedules
        if (this.scheduleRepeat === 'single') {
          const dateEntity = this.hass.states['input_datetime.boiler_schedule_date'];
          if (dateEntity) this.scheduleDate = dateEntity.state;
        }
        
        // Load selected days
        const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        this.selectedDays = [];
        for (let i = 0; i < 7; i++) {
          const dayEntity = this.hass.states[`input_boolean.boiler_schedule_${dayNames[i]}`];
          if (dayEntity?.state === 'on') {
            this.selectedDays.push(i.toString());
          }
        }
      } else {
        this.isScheduleSet = false;
      }
    } catch (error) {
      console.error('Error loading schedule:', error);
    }
  }

  private async clearSchedule() {
    try {
      // Disable the schedule
      await this.hass.callService('input_boolean', 'turn_off', {
        entity_id: 'input_boolean.boiler_schedule_enabled'
      });
      
      // Clear all day selections
      const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      for (const day of dayNames) {
        await this.hass.callService('input_boolean', 'turn_off', {
          entity_id: `input_boolean.boiler_schedule_${day}`
        });
      }
      
      // Reset schedule state
      this.isScheduleSet = false;
      this.selectedDays = [];
      
      // Reset time values to defaults
      this.startTime = this.getCurrentTime();
      this.endTime = this.getCurrentTimePlus15();
      this.scheduleDate = this.getTodayDate();
    } catch (error) {
      console.error('Error clearing schedule:', error);
    }
  }

  private async setupSchedulerHelpers(): Promise<boolean> {
    try {
      this.setupInProgress = true;
      this.setupMessage = 'Checking scheduler setup...';
      
      // Check if helpers already exist
      const requiredHelpers = [
        'input_datetime.boiler_schedule_start',
        'input_datetime.boiler_schedule_end',
        'input_datetime.boiler_schedule_date',
        'input_select.boiler_schedule_mode',
        'input_boolean.boiler_schedule_enabled',
        'input_boolean.boiler_schedule_mon',
        'input_boolean.boiler_schedule_tue',
        'input_boolean.boiler_schedule_wed',
        'input_boolean.boiler_schedule_thu',
        'input_boolean.boiler_schedule_fri',
        'input_boolean.boiler_schedule_sat',
        'input_boolean.boiler_schedule_sun'
      ];

      const missingHelpers = requiredHelpers.filter(id => !this.hass.states[id]);
      
      if (missingHelpers.length === 0) {
        this.setupMessage = 'Scheduler already configured! ✅';
        setTimeout(() => this.setupMessage = '', 2000);
        this.helpersSetup = true;
        this.setupInProgress = false;
        return true;
      }

      // Helpers don't exist - show YAML config for manual setup
      this.setupMessage = '';
      this.setupInProgress = false;
      
      const yamlConfig = `input_datetime:
  boiler_schedule_start:
    name: Boiler Schedule Start
    has_date: false
    has_time: true
  boiler_schedule_end:
    name: Boiler Schedule End
    has_date: false
    has_time: true
  boiler_schedule_date:
    name: Boiler Schedule Date
    has_date: true
    has_time: false

input_select:
  boiler_schedule_mode:
    name: Boiler Schedule Mode
    options:
      - single
      - repeat

input_boolean:
  boiler_schedule_enabled:
    name: Boiler Schedule Enabled
  boiler_schedule_mon:
    name: Monday
  boiler_schedule_tue:
    name: Tuesday
  boiler_schedule_wed:
    name: Wednesday
  boiler_schedule_thu:
    name: Thursday
  boiler_schedule_fri:
    name: Friday
  boiler_schedule_sat:
    name: Saturday
  boiler_schedule_sun:
    name: Sunday`;

      // Automation YAML with proper time_pattern trigger
      const automationYaml = `automation:
  - alias: Boiler Scheduled Turn On
    description: Turn on boiler based on schedule
    trigger:
      - platform: time_pattern
        minutes: "*"
    condition:
      - condition: template
        value_template: >
          {% set now_time = now().strftime('%H:%M') %}
          {% set start_time = states('input_datetime.boiler_schedule_start')[0:5] %}
          {% set enabled = is_state('input_boolean.boiler_schedule_enabled', 'on') %}
          {% set mode = states('input_select.boiler_schedule_mode') %}
          {% if not enabled %}
            false
          {% elif mode == 'single' %}
            {% set schedule_date = states('input_datetime.boiler_schedule_date') %}
            {% set today_date = now().strftime('%Y-%m-%d') %}
            {{ now_time == start_time and schedule_date == today_date }}
          {% else %}
            {% set day_map = {0: 'input_boolean.boiler_schedule_mon', 1: 'input_boolean.boiler_schedule_tue', 2: 'input_boolean.boiler_schedule_wed', 3: 'input_boolean.boiler_schedule_thu', 4: 'input_boolean.boiler_schedule_fri', 5: 'input_boolean.boiler_schedule_sat', 6: 'input_boolean.boiler_schedule_sun'} %}
            {% set today = now().weekday() %}
            {% set today_enabled = is_state(day_map[today], 'on') %}
            {{ now_time == start_time and today_enabled }}
          {% endif %}
    action:
      - service: switcher_kis.turn_on_with_timer
        data:
          timer_minutes: >
            {% set start = states('input_datetime.boiler_schedule_start') %}
            {% set end = states('input_datetime.boiler_schedule_end') %}
            {% set start_minutes = (start.split(':')[0]|int * 60) + start.split(':')[1]|int %}
            {% set end_minutes = (end.split(':')[0]|int * 60) + end.split(':')[1]|int %}
            {% if end_minutes > start_minutes %}
              {{ end_minutes - start_minutes }}
            {% else %}
              {{ (1440 - start_minutes) + end_minutes }}
            {% endif %}
        target:
          entity_id: ${this.config.entity}
    mode: single`;

      // Show notification with instructions
      this.hass.callService('persistent_notification', 'create', {
        title: '📅 Scheduler Setup Required',
        message: `The scheduler feature requires helper entities and automation.

**Step 1: Add helpers to configuration.yaml:**

\`\`\`yaml
${yamlConfig}
\`\`\`

**Step 2: Add automation:**

\`\`\`yaml
${automationYaml}
\`\`\`

Then go to **Settings → System → Restart** and restart Home Assistant.

[View full documentation](https://github.com/your-repo/switcher-donut-card#scheduler-setup)`,
        notification_id: 'switcher_donut_scheduler_setup'
      });

      console.error('\n=== SCHEDULER SETUP REQUIRED ===');
      console.error('Please add helpers to your configuration.yaml:\n');
      console.error(yamlConfig);
      console.error('\n\nAnd add this automation:\n');
      console.error(automationYaml);
      console.error('\nThen restart Home Assistant or reload YAML configuration.');
      console.error('================================\n');
      
      this.setupMessage = '⚠️ Helpers required - check notification';
      this.helpersSetup = false;
      return false;
    } catch (error) {
      console.error('Error during scheduler setup:', error);
      this.setupMessage = '❌ Setup failed - see console';
      this.helpersSetup = false;
      this.setupInProgress = false;
      
      this.hass.callService('persistent_notification', 'create', {
        title: '❌ Scheduler Setup Failed',
        message: `An error occurred during setup: ${error}\n\nPlease check the browser console for details or set up manually using configuration.yaml.`,
        notification_id: 'switcher_donut_scheduler_error'
      });
      
      return false;
    }
  }

  private confirmSchedulerSetup() {
    this.showSetupPrompt = false;
    this.setupSchedulerHelpers();
  }

  private cancelSchedulerSetup() {
    this.showSetupPrompt = false;
  }

  private async toggleScheduler() {
    if (!this.showScheduler && !this.helpersSetup) {
      // Check if helpers exist first
      const requiredHelpers = [
        'input_datetime.boiler_schedule_start',
        'input_boolean.boiler_schedule_enabled'
      ];
      
      const helpersExist = requiredHelpers.every(id => this.hass.states[id]);
      
      if (!helpersExist) {
        // Show confirmation prompt
        this.showSetupPrompt = true;
        return;
      } else {
        this.helpersSetup = true;
      }
    }
    
    this.showScheduler = !this.showScheduler;
  }

  private toggleDay(day: string) {
    if (this.selectedDays.includes(day)) {
      this.selectedDays = this.selectedDays.filter(d => d !== day);
    } else {
      this.selectedDays = [...this.selectedDays, day];
    }
  }

  private lastActionTimestamp = 0;

  private lastAngle = 0;

  private readonly RADIUS = 100;
  private readonly STROKE = 28;
  private readonly CENTER = 125;

  setConfig(config: any) {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    if (!config.entity) {
      throw new Error('You must define an "entity"');
    }
    if (!config.time_entity) {
      throw new Error('You must define a "time_entity"');
    }
    this.config = config;
  }

  getCardSize() {
    return 5;
  }

  static getConfigElement() {
    return document.createElement('switcher-donut-card-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:switcher-donut-card',
      title: '',
      entity: '',
      time_entity: '',
      power_entity: '',
      current_entity: '',
      boiler_auto_shutdown: '',
      icon: 'mdi:water-thermometer',
      icon_size: '32px',
    };
  }

  shouldUpdate(changedProperties: Map<string, any>) {
    // Prevent re-renders from hass updates while actively dragging
    // This stops the browser demo's 1-second timer updates from interfering
    if (this.isDragging && changedProperties.has('hass') && changedProperties.size === 1) {
      return false;
    }
    return true;
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has('hass') && this.hass && this.config) {
      // Check if helpers exist
      if (!this.helpersSetup && this.hass.states['input_boolean.boiler_schedule_enabled']) {
        this.helpersSetup = true;
      }
      this.loadSchedule();
      
      // Detect when boiler turns off automatically (timer finished)
      const currentState = this.hass.states[this.config.entity]?.state;
      const timeSinceLastAction = Date.now() - this.lastActionTimestamp;
      
      // If boiler turned off AND it's been more than 5 seconds since user action, assume timer completed
      if (this.lastBoilerState === 'on' && currentState === 'off' && timeSinceLastAction > 5000) {
        // Send internal HA notification
        this.hass.callService('persistent_notification', 'create', {
          message: 'Water heating cycle completed',
          title: '♨️ Boiler Ready',
          notification_id: 'boiler_ready'
        });
        // Send push notification when heating is complete
        this.hass.callService('notify', 'notify', {
          message: 'Water heating cycle completed',
          title: '♨️ Boiler Ready'
        });
      }
      
      this.lastBoilerState = currentState;
    }
  }

  private parseRemainingTime(timeStr: string): { minutes: number; seconds: number } {
    if (!timeStr || timeStr === 'unavailable' || timeStr === 'unknown') return { minutes: 0, seconds: 0 };
    const parts = timeStr.split(':');
    if (parts.length !== 3) return { minutes: 0, seconds: 0 };
    const totalMinutes = (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    return { minutes: totalMinutes, seconds };
  }

  static styles = css`
:host { display: block; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
    
    ha-card {
      position: relative;
      padding: 32px 16px; 
      display: flex; flex-direction: column; align-items: center;
      background: var(--card-background-color, var(--ha-card-background, var(--primary-background-color)));
      border-radius: var(--ha-card-border-radius, 12px);
      box-shadow: var(--ha-card-box-shadow, 0 2px 4px 0 rgba(0, 0, 0, 0.14));
      overflow: hidden;
      min-width: 400px; /* Fixed minimum - prevents shrinking and overlapping */
      box-sizing: border-box;
    }

    .card-title {
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--primary-text-color);
      margin: 0 0 8px 0;
      text-align: center;
      width: 100%;
    }
    
    .card-icon {
      position: absolute; top: 16px; left: 16px;
      color: var(--secondary-text-color);
      transition: color 0.3s ease;
    }
    .card-icon.active { color: var(--error-color, #ff9800); }

    /* --- FLEXBOX LAYOUT --- */
    .main-layout {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 32px;
      width: 100%;
      margin-top: 16px;
      flex-wrap: nowrap;
    }

    /* --- THE DONUT (Fixed Size) --- */
    .donut-container {
      position: relative;
      width: 250px;
      height: 250px;
      touch-action: none;
      cursor: pointer;
      flex-shrink: 0; /* Prevents shrinking */
      margin-left: 16px;
    }
    .time-display {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%); text-align: center;
      pointer-events: none;
    }
    .time-display h2 { margin: 0; font-size: 2.5rem; font-weight: 500; color: var(--primary-text-color); line-height: 1; letter-spacing: -2px; }
    .time-display p { margin: 4px 0 0 0; font-size: 1rem; color: var(--secondary-text-color); font-weight: 500; text-transform: uppercase; letter-spacing: 1px; }
    
    .thumb { filter: drop-shadow(0px 2px 6px rgba(0,0,0,0.4)); }

    /* --- GOLDILOCKS VERTICAL TOGGLE SWITCH --- */
    .switch-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
      flex-shrink: 0;
      margin-right: 16px;
    }
    
    .switch { 
      position: relative; 
      display: inline-block; 
      width: 68px; 
      height: 140px; /* 56% the height of the donut - perfect proportion */
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    
    .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: var(--divider-color, #e0e0e0);
      transition: .3s cubic-bezier(0.4, 0.0, 0.2, 1);
      border-radius: 68px; 
    }
    
    .slider-thumb {
      position: absolute; 
      height: 60px; 
      width: 60px; 
      left: 4px; 
      bottom: 4px; 
      background-color: var(--card-background-color, var(--ha-card-background, #fff)); border-radius: 50%;
      box-shadow: 0 3px 8px rgba(0,0,0,0.2); 
      transition: transform .3s cubic-bezier(0.4, 0.0, 0.2, 1), color .3s;
      display: flex; align-items: center; justify-content: center;
      color: var(--secondary-text-color, #727272); 
    }
    
    /* Neatly sized power icon */
    .slider-thumb svg { width: 32px; height: 32px; fill: currentColor; }
    
    input:checked + .slider { background-color: var(--error-color, #ff9800); }
    
    /* THE FIX: Travel distance is exactly 72px 
       (140px height - 60px thumb - 8px total margins = 72px) */
    input:checked + .slider .slider-thumb { 
      transform: translateY(-72px); 
      color: var(--error-color, #ff9800); 
    }

    /* --- SENSOR STATS ROW --- */
    .stats-container {
      width: 100%;
      display: flex;
      justify-content: space-around;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }
    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .stat-value {
      font-size: 1.3rem;
      font-weight: bold;
      color: var(--primary-text-color, #212121);
    }
    .stat-label {
      font-size: 0.8rem;
      color: var(--secondary-text-color, #727272);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 4px;
    }

    .donut-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .auto-shutdown-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 10px;
      padding: 4px 12px;
      color: var(--secondary-text-color);
      font-size: 0.85rem;
      z-index: 2;
    }
    
    .auto-shutdown-icon {
      width: 16px;
      height: 16px;
      fill: var(--error-color, var(--warning-color, #ff6a00));
      flex-shrink: 0;
    }

    .auto-shutdown-value {
      color: var(--primary-text-color);
      font-weight: 600;
    }
    
    .calendar-icon {
      width: 42px; 
      height: 42px;
      cursor: pointer;
      fill: var(--secondary-text-color, #727272);
      transition: fill 0.3s ease, transform 0.2s;
    }
    .calendar-icon.active-red {
      fill: var(--error-color, var(--warning-color, #ff6a00));
    }
    .calendar-icon:active { 
      transform: scale(0.9);
    }
    .calendar-icon.disabled {
      fill: var(--disabled-text-color, #999);
      opacity: 0.5;
      cursor: help;
    }

    .scheduler-panel {
      width: 100%;
      margin-top: 24px;
      padding: 16px 0;
      border-top: 1px dashed var(--divider-color);
      display: flex;
      flex-direction: column;
      gap: 16px;
      background: transparent; /* Same color as main card */
    }

    .setup-message {
      padding: 12px;
      border-radius: 8px;
      text-align: center;
      font-size: 0.9rem;
      font-weight: 500;
      background: color-mix(in srgb, var(--error-color, #ff9800) 10%, transparent);
      color: var(--error-color, #ff9800);
      border: 1px solid color-mix(in srgb, var(--error-color, #ff9800) 30%, transparent);
    }

    .setup-instructions {
      padding: 16px;
      background: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, transparent);
      border-radius: 8px;
      margin-bottom: 16px;
      line-height: 1.6;
    }

    .setup-instructions strong {
      color: var(--primary-color);
    }

    .setup-instructions ol {
      margin: 12px 0;
      padding-left: 20px;
    }

    .setup-instructions li {
      margin: 8px 0;
    }

    code {
      background: color-mix(in srgb, var(--primary-text-color, #000) 10%, transparent);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      color: var(--primary-text-color);
    }

    .setup-prompt-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease-in-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .setup-prompt-dialog {
      background: var(--card-background-color);
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .setup-prompt-dialog h3 {
      margin: 0 0 16px 0;
      color: var(--primary-color);
      font-size: 1.3em;
    }

    .setup-prompt-dialog p {
      margin: 12px 0;
      line-height: 1.5;
      color: var(--primary-text-color);
    }

    .setup-prompt-dialog ul {
      margin: 12px 0;
      padding-left: 20px;
      color: var(--primary-text-color);
    }

    .setup-prompt-dialog li {
      margin: 8px 0;
      line-height: 1.5;
      color: var(--primary-text-color);
    }

    .setup-prompt-buttons {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }

    .btn-cancel {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      transition: all 0.2s;
    }

    .btn-cancel:hover {
      background: var(--divider-color);
    }

    .btn-confirm {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      transition: all 0.2s;
    }

    .btn-confirm:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .btn-confirm:active {
      transform: translateY(0);
    }

    .time-inputs { display: flex; justify-content: center; gap: 24px; }
    .time-field { display: flex; flex-direction: column; align-items: center; }
    .time-field label { font-size: 0.75rem; margin-bottom: 6px; color: var(--secondary-text-color); text-transform: uppercase; }
    .time-field input { 
      padding: 10px; border-radius: 8px; border: 1px solid var(--divider-color);
      background: var(--card-background-color, var(--ha-card-background, #fff)); color: var(--primary-text-color);
      font-family: inherit; font-size: 1rem;
      width: 120px;
      text-align: center;
      line-height: 1.5;
    }
    .time-field input::-webkit-calendar-picker-indicator {
      filter: invert(0.5);
    }

    .day-picker { display: flex; justify-content: space-between; margin: 10px 0; width: 100%; }
    .day-circle {
      width: 34px; height: 34px; border-radius: 50%;
      border: 1px solid var(--divider-color);
      display: flex; align-items: center; justify-content: center;
      font-size: 0.75rem; cursor: pointer; transition: 0.2s;
      background: var(--card-background-color, var(--ha-card-background, #fff));
    }
    .day-circle.selected {
      background: var(--error-color, var(--warning-color, #ff6a00));
      color: var(--text-primary-color, #fff);
      border-color: var(--error-color, var(--warning-color, #ff6a00));
    }

    .button-group {
      display: flex;
      gap: 10px;
      margin-top: 10px;
      width: 100%;
    }

    .btn-save { 
      background: var(--error-color, var(--warning-color, #ff6a00));
      color: var(--text-primary-color, #fff);
      border: none;
      padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer;
      flex: 1;
    }

    .btn-clear {
      background: var(--secondary-background-color, var(--secondary-text-color, #727272));
      color: var(--text-primary-color, #fff);
      border: none;
      padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer;
      flex: 1;
    }

    .btn-clear:hover {
      background: var(--primary-text-color, #212121);
    }

    .btn-save:hover {
      filter: brightness(0.9);
    }

    /* --- HEATING EFFECT --- */
    @keyframes heating-pulse {
      0%, 100% {
        filter: drop-shadow(0 0 8px var(--error-color, #ff9800));
      }
      50% {
        filter: drop-shadow(0 0 16px var(--error-color, #ff9800)) drop-shadow(0 0 24px var(--error-color, #ff9800));
      }
    }

    .donut-container.heating {
      animation: heating-pulse 2s ease-in-out infinite;
    }
  `;

  private getAngleFromEvent(e: PointerEvent): number {
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const x = e.clientX - rect.left - this.CENTER;
    const y = e.clientY - rect.top - this.CENTER;
    let angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
    return angle < 0 ? angle + 360 : angle;
  }

  private handlePointerDown(e: PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);

    // Calculate the angle from click position
    const clickAngle = this.getAngleFromEvent(e);
    
    // Determine the base time to use for calculation
    let baseMinutes = this.targetMinutes;
    
    // If the boiler is already running, use the current real-world remaining time as base
    if (this.isBoilerRunning()) {
      const timeData = this.parseRemainingTime(this.hass.states[this.config.time_entity]?.state);
      baseMinutes = timeData.minutes + (timeData.seconds / 60);
    }

    // Calculate new target minutes based on clicked position
    const currentHourBase = Math.floor(baseMinutes / 60) * 60;
    const newTargetMinutes = currentHourBase + (clickAngle / 360) * 60;
    
    // Store the angle for subsequent move events
    this.lastAngle = clickAngle;
    
    // Update both state properties - Lit batches these into single render
    this.targetMinutes = newTargetMinutes;
    this.isDragging = true;
  }

  private handlePointerMove(e: PointerEvent) {
    if (!this.isDragging) return;

    const currentAngle = this.getAngleFromEvent(e);
    let deltaAngle = currentAngle - this.lastAngle;

    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    this.targetMinutes += (deltaAngle / 360) * 60;
    this.targetMinutes = Math.max(0, this.targetMinutes);
    this.lastAngle = currentAngle;
  }

  private handlePointerUp(e: PointerEvent) {
    if (!this.isDragging) return;
    this.isDragging = false;
    (e.target as Element).releasePointerCapture(e.pointerId);

    // NEW: Lock the UI to our optimistic state for 3 seconds
    this.lastActionTimestamp = Date.now();

    if (this.targetMinutes > 0) {
      const minutes = Math.round(this.targetMinutes);
      this.hass.callService('switcher_kis', 'turn_on_with_timer', {
        entity_id: this.config.entity,
        timer_minutes: minutes
      });
      // Send internal notification
      this.hass.callService('persistent_notification', 'create', {
        message: `Boiler turned ON for ${minutes} minute${minutes !== 1 ? 's' : ''}`,
        title: '♨️ Boiler Started',
        notification_id: 'boiler_timer_started'
      });
      // Don't reset targetMinutes - let the optimistic lock keep showing this value
      // until hardware state updates (after 3 seconds or when actual state arrives)
    } else if (this.targetMinutes === 0 && this.isBoilerRunning()) {
      this.hass.callService('switch', 'turn_off', { entity_id: this.config.entity });
    }
  }

  private isBoilerRunning(): boolean {
    return this.hass?.states[this.config?.entity]?.state === 'on';
  }

  private handleToggleChange() {
    const isRunning = this.isBoilerRunning();

    // NEW: Lock the UI to our optimistic state for 3 seconds
    this.lastActionTimestamp = Date.now();

    if (isRunning) {
      this.hass.callService('switch', 'turn_off', { entity_id: this.config.entity });
      this.targetMinutes = 0;
    } else {
      // If timer was set via donut, use it. Otherwise, just turn ON (hardware auto-shutdown will handle it)
      if (this.targetMinutes > 0) {
        const minutes = Math.round(this.targetMinutes);
        this.hass.callService('switcher_kis', 'turn_on_with_timer', {
          entity_id: this.config.entity,
          timer_minutes: minutes
        });
        // Send internal notification
        this.hass.callService('persistent_notification', 'create', {
          message: `Boiler turned ON for ${minutes} minute${minutes !== 1 ? 's' : ''}`,
          title: '♨️ Boiler Started',
          notification_id: 'boiler_timer_started'
        });
      } else {
        // No timer set via donut - use auto-shutdown time
        let timerMinutes = 60; // Default fallback
        
        // Try to get auto-off time from sensor
        if (this.config.boiler_auto_shutdown && this.hass.states[this.config.boiler_auto_shutdown]) {
          const autoOffValue = this.hass.states[this.config.boiler_auto_shutdown].state;
          // Parse HH:MM:SS format
          if (autoOffValue && autoOffValue.includes(':')) {
            const parts = autoOffValue.split(':');
            const hours = parseInt(parts[0], 10) || 0;
            const mins = parseInt(parts[1], 10) || 0;
            timerMinutes = hours * 60 + mins;
          }
        }
        
        this.hass.callService('switcher_kis', 'turn_on_with_timer', {
          entity_id: this.config.entity,
          timer_minutes: timerMinutes
        });
        // Send internal notification
        this.hass.callService('persistent_notification', 'create', {
          message: `Boiler turned ON for ${timerMinutes} minute${timerMinutes !== 1 ? 's' : ''}`,
          title: '♨️ Boiler Started',
          notification_id: 'boiler_timer_started'
        });
      }
    }
  }

  render() {
    if (!this.hass || !this.config) return html``;

    const isRunning = this.isBoilerRunning();

    // If running AND we are NOT dragging, show hardware state. Otherwise, show user's drag state.
    // Check if we interacted with the card less than 3 seconds ago
    const isOptimisticLock = (Date.now() - this.lastActionTimestamp) < 3000;

    // If running, not dragging, AND the lock has expired, show the real HA hardware state. 
    // Otherwise, show the user's optimistic target state to prevent snapping.
    let activeMinutes: number;
    let activeSeconds: number;
    
    if (isRunning && !this.isDragging && !isOptimisticLock) {
      const timeData = this.parseRemainingTime(this.hass.states[this.config.time_entity]?.state);
      activeMinutes = timeData.minutes;
      activeSeconds = timeData.seconds;
    } else {
      activeMinutes = this.targetMinutes;
      activeSeconds = 0;
    }

    const displayHours = Math.floor(activeMinutes / 60);
    const displayMins = Math.floor(activeMinutes % 60);
    const pad = (num: number) => num.toString().padStart(2, '0');
    const timeString = `${pad(displayHours)}:${pad(displayMins)}:${pad(activeSeconds)}`;

    const activeColor = isRunning ? 'var(--error-color, #ff9800)' : 'var(--primary-color, #03A9F4)';
    const trackColor = 'var(--divider-color, #e0e0e0)';

    const circumference = 2 * Math.PI * this.RADIUS;
    const currentCircleProgress = (activeMinutes % 60) / 60;
    const normalizedProgress = (currentCircleProgress === 0 && activeMinutes > 0) ? 1 : currentCircleProgress;
    const strokeDashoffset = circumference - (normalizedProgress * circumference);
    const rotationDegrees = normalizedProgress * 360;

    const transitionStyle = this.isDragging
      ? 'transition: none;'  // No transitions during dragging for instant feedback
      : (isRunning
        ? 'transition: transform 1s linear, stroke-dashoffset 1s linear, stroke 0.3s ease;'
        : 'transition: stroke 0.3s ease;');

    // Safely parse Power (W) - only if entity exists
    const powerEntity = this.config.power_entity && this.hass.states[this.config.power_entity];
    const powerState = powerEntity ? powerEntity.state : null;

    // Safely parse Current (A) and force 1 decimal place - only if entity exists
    const currentEntity = this.config.current_entity && this.hass.states[this.config.current_entity];
    const currentRaw = currentEntity ? parseFloat(currentEntity.state) : null;
    const currentState = currentRaw !== null && !isNaN(currentRaw) ? currentRaw.toFixed(1) : null;

    // Parse Auto Shutdown (e.g., "01:00:00" -> "1h")
    const autoOffRaw = this.config.boiler_auto_shutdown && this.hass.states[this.config.boiler_auto_shutdown]
      ? this.hass.states[this.config.boiler_auto_shutdown].state
      : null;

    // Check if the config exists first so the row never disappears
    const autoOffEntityState = this.config.boiler_auto_shutdown ? this.hass.states[this.config.boiler_auto_shutdown] : null;
    const autoOffValue = autoOffEntityState ? autoOffEntityState.state : '---';

    let autoOffDisplay = 'Not Set';
    if (autoOffValue && autoOffValue.includes(':')) {
      // Display in HH:MM format with 'h' suffix
      autoOffDisplay = autoOffValue.substring(0, 5) + 'h';
    } else if (autoOffValue !== '---') {
      autoOffDisplay = autoOffValue; // Fallback for non-time strings
    }

    return html`
      <ha-card>
        ${this.config.title ? html`<h2 class="card-title">${this.config.title}</h2>` : ''}
        <!-- Top-left status icon - defaults to water-heater if not configured -->
        <ha-icon 
          class="card-icon ${isRunning ? 'active' : ''}" 
          icon="${this.config.icon || 'mdi:water-heater'}"
          style="--mdc-icon-size: ${this.config.icon_size || '28px'};">
        </ha-icon>

        <div class="main-layout">
          <div class="donut-wrapper">
            <div class="donut-container ${isRunning ? 'heating' : ''}"
                 @pointerdown=${this.handlePointerDown}
                 @pointermove=${this.handlePointerMove}
                 @pointerup=${this.handlePointerUp}
                 @pointercancel=${this.handlePointerUp}>
              
              <svg width="250" height="250" viewBox="0 0 250 250" style="transform: rotate(-90deg);">
                <circle cx="${this.CENTER}" cy="${this.CENTER}" r="${this.RADIUS}" fill="none" stroke="${trackColor}" stroke-width="${this.STROKE}"></circle>
                
                <circle cx="${this.CENTER}" cy="${this.CENTER}" r="${this.RADIUS}" fill="none" 
                        stroke="${activeColor}" 
                        stroke-width="${this.STROKE}" 
                        stroke-dasharray="${circumference}" 
                        stroke-dashoffset="${strokeDashoffset}" 
                        stroke-linecap="round"
                        style="${transitionStyle}"></circle>

                <g style="transform-origin: ${this.CENTER}px ${this.CENTER}px; transform: rotate(${rotationDegrees}deg); ${transitionStyle}">
                  <circle class="thumb" 
                          cx="${this.CENTER + this.RADIUS}" cy="${this.CENTER}" r="16" 
                          fill="var(--card-background-color, var(--ha-card-background, #fff))" stroke="${activeColor}" stroke-width="6"></circle>
                </g>
              </svg>

              <div class="time-display">
                <h2>${timeString}</h2>
                <p>${isRunning ? 'Remaining' : (displayHours > 0 ? 'Hours' : 'Minutes')}</p>
              </div>
            </div>
            ${autoOffRaw ? html`
              <div class="auto-shutdown-row">
                <svg class="auto-shutdown-icon" viewBox="0 0 24 24">
                  <path d="M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22A9,9 0 0,0 21,13A9,9 0 0,0 12,4M12.5,8H11V14L15.75,16.85L16.5,15.62L12.5,13.25V8M7.88,3.39L6.6,1.86L2,5.71L3.29,7.24L7.88,3.39M22,5.71L17.4,1.86L16.11,3.39L20.71,7.24L22,5.71Z" />
                </svg>
                <span>Auto Off: <span class="auto-shutdown-value">${autoOffDisplay}</span></span>
              </div>
            ` : ''}
          </div>

          <div class="switch-wrapper">
            <label class="switch">
              <input type="checkbox" .checked=${isRunning} @change=${this.handleToggleChange}>
              <span class="slider">
                <div class="slider-thumb">
                  <svg viewBox="0 0 24 24"><path d="M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M11,3V13H13V3H11Z" /></svg>
                </div>
              </span>
            </label>
            <svg 
                class="calendar-icon ${this.showScheduler || this.isScheduleSet ? 'active-red' : ''} ${!this.helpersSetup ? 'disabled' : ''}" 
                @click=${this.toggleScheduler} 
                viewBox="0 0 24 24"
                title="${this.helpersSetup ? 'Open Scheduler' : 'Scheduler Setup Required - Click for instructions'}">
                <path d="M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.9 20.1,3 19,3H18V1M17,12H12V17H17V12Z" />
            </svg>
          </div>
      </div>
      
        ${this.showSetupPrompt ? html`
          <div class="setup-prompt-overlay">
            <div class="setup-prompt-dialog">
              <h3>📅 Scheduler Setup</h3>
              <p>The scheduler requires helper entities to be configured.</p>
              <p><strong>You'll need to add to configuration.yaml:</strong></p>
              <ul>
                <li>✅ 3 time helpers (start, end, date)</li>
                <li>✅ 1 mode selector (single/repeat)</li>
                <li>✅ 8 day toggles (enable + weekdays)</li>
              </ul>
              <p style="margin-top: 12px; padding: 8px; background: color-mix(in srgb, var(--info-color, var(--primary-color, #03a9f4)) 10%, transparent); border-radius: 4px; font-size: 0.9em; color: var(--primary-text-color);">
                💡 Click "Show YAML" to get the complete configuration you need to copy to configuration.yaml
              </p>
              <div class="setup-prompt-buttons">
                <button class="btn-cancel" @click=${this.cancelSchedulerSetup}>Cancel</button>
                <button class="btn-confirm" @click=${this.confirmSchedulerSetup}>
                  Show YAML
                </button>
              </div>
            </div>
          </div>
        ` : ''}

        ${this.showScheduler ? html`
          <div class="scheduler-panel">
            ${!this.helpersSetup ? html`
              <div class="setup-instructions">
                <strong>📅 Scheduler Setup Required</strong>
                <p>To use the scheduler, add these helper entities to your <code>configuration.yaml</code>:</p>
                <ol>
                  <li>Open <code>/config/configuration.yaml</code> in File Editor</li>
                  <li>Add the helper entities (see <a href="https://github.com/your-repo/switcher-donut-card/blob/main/card-config-example.yaml" target="_blank" style="color: var(--primary-color);">card-config-example.yaml</a> lines 77-124)</li>
                  <li>Go to <strong>Settings → System → Restart</strong></li>
                  <li>After restart, the scheduler will be active!</li>
                </ol>
                <p style="margin-top: 12px; padding: 8px; background: color-mix(in srgb, var(--info-color, var(--primary-color, #03a9f4)) 10%, transparent); border-radius: 4px; font-size: 0.9em; color: var(--primary-text-color);">
                  💡 A notification with the complete YAML code has been created in your notifications panel.
                </p>
              </div>
            ` : html`
              ${this.setupMessage ? html`
                <div class="setup-message">${this.setupMessage}</div>
              ` : ''}

              <div style="display: flex; justify-content: center; gap: 30px; margin-bottom: 16px;">
                <label style="color: var(--primary-text-color); cursor: pointer;"><input type="radio" name="repeat" .checked=${this.scheduleRepeat === 'single'} @change=${() => this.scheduleRepeat = 'single'}> Once</label>
                <label style="color: var(--primary-text-color); cursor: pointer;"><input type="radio" name="repeat" .checked=${this.scheduleRepeat === 'repeat'} @change=${() => this.scheduleRepeat = 'repeat'}> Daily</label>
              </div>

              ${this.scheduleRepeat === 'single' ? html`
                <div class="time-field" style="margin-bottom: 16px;">
                  <label>Date</label>
                  <input type="date" .value=${this.scheduleDate} @input=${(e: any) => this.scheduleDate = e.target.value}>
                </div>
              ` : ''}

              <div class="time-inputs">
                <div class="time-field">
                  <label>Start</label>
                  <input type="time" .value=${this.startTime} @input=${(e: any) => this.startTime = e.target.value}>
                </div>
                <div class="time-field">
                  <label>End</label>
                  <input type="time" .value=${this.endTime} @input=${(e: any) => this.endTime = e.target.value}>
                </div>
              </div>

              ${this.scheduleRepeat === 'repeat' ? html`
                <div class="day-picker">
                  ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => html`
                    <div class="day-circle ${this.selectedDays.includes(i.toString()) ? 'selected' : ''}"
                        @click=${() => this.toggleDay(i.toString())}>
                      ${day}
                    </div>
                  `)}
                </div>
              ` : ''}

              <div class="button-group">
                <button class="btn-clear" @click=${this.clearSchedule}>CLEAR</button>
                <button class="btn-save" @click=${this.saveSchedule}>SAVE</button>
              </div>
            `}
          </div>
        ` : ''}

        ${(powerState !== null || currentState !== null) ? html`
          <div class="stats-container">
            ${powerState !== null ? html`
              <div class="stat-item">
                <span class="stat-value">${powerState} W</span>
                <span class="stat-label">Power</span>
              </div>
            ` : ''}
            
            ${currentState !== null ? html`
              <div class="stat-item">
                <span class="stat-value">${currentState} A</span>
                <span class="stat-label">Current</span>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </ha-card>
    `;
  }
}

// Visual editor using ha-form with schema
@customElement('switcher-donut-card-editor')
export class SwitcherDonutCardEditor extends LitElement {
  @property({ attribute: false }) hass?: any;
  @property({ attribute: false }) config?: any;
  @state() private _schema?: any[];

  setConfig(config: any) {
    this.config = {
      title: '',
      entity: '',
      time_entity: '',
      power_entity: '',
      current_entity: '',
      boiler_auto_shutdown: '',
      icon: 'mdi:water-thermometer',
      icon_size: '32px',
      ...config
    };
    this._schema = this._buildSchema();
  }

  private _buildSchema() {
    return [
      {
        name: 'title',
        label: 'Title (Optional)',
        selector: { text: { placeholder: 'Boiler' } },
      },
      {
        name: 'entity',
        label: 'Entity (Required)',
        required: true,
        selector: { 
          entity: { 
            domain: 'switch',
          } 
        },
      },
      {
        name: 'time_entity',
        label: 'Time Entity (Required)',
        required: true,
        selector: { 
          entity: { 
            domain: 'sensor',
          } 
        },
      },
      {
        name: 'power_entity',
        label: 'Power Entity (Optional)',
        selector: { 
          entity: { 
            domain: 'sensor',
          } 
        },
      },
      {
        name: 'current_entity',
        label: 'Current Entity (Optional)',
        selector: { 
          entity: { 
            domain: 'sensor',
          } 
        },
      },
      {
        name: 'boiler_auto_shutdown',
        label: 'Auto Shutdown Entity (Optional)',
        selector: { 
          entity: { 
            domain: 'sensor',
          } 
        },
      },
      {
        name: 'icon',
        label: 'Icon (Optional)',
        selector: { 
          icon: { 
            placeholder: 'mdi:water-thermometer',
          } 
        },
      },
      {
        name: 'icon_size',
        label: 'Icon Size (Optional)',
        selector: { 
          text: { 
            placeholder: '32px',
          } 
        },
      },
    ];
  }

  render() {
    if (!this.hass || !this.config || !this._schema) {
      return html``;
    }

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this._schema}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _computeLabel = (schema: any) => {
    return schema.label || schema.name;
  };

  private _valueChanged(ev: any) {
    const newConfig = ev.detail.value;
    
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }
}

// Register the card in the card picker
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'switcher-donut-card',
  name: 'Switcher Donut Card',
  description: 'Interactive donut timer with scheduler for Switcher Touch boilers',
  preview: false,
  documentationURL: 'https://github.com/Pakingster/switcher-donut-card',
});