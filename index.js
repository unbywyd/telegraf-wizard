const {Markup, Scenes, Composer } = require('telegraf');
const BaseScene = Scenes.BaseScene, Stage = Scenes.Stage;

module.exports = function(Bot, globalOptions={}) {  
    if(!Bot.Wizards) {
        init();        
    }  
    function i18n(context, {module}) {
        let slug = context.i18nPluginSlug ? context.i18nPluginSlug : 'i18n';
        if('function' == typeof globalOptions.translator) {
            return globalOptions.translator(context, {module}); // should return a function that will take a string to translate
        } else if(context[slug]) {           
            return context[slug]({
                module: module || 'common'
            })
        } else {
            return (str) => str
        }
    }
    function getState(context, defaultData={}) {
        let data = {};
        if(context.session && context.session.stateWizard) {
            context.session.stateWizard.forEach((value, key) => {
                data = Object.assign(data, value);
            });
        }
        return {...defaultData, ...data};    
    }
    function wizard(id, options={}) {
        this.scenes = [];
        this.name = options.display_name ? options.display_name : id;
        this.id = id.replace(/[^\w\d]+/g, '').toLowerCase();
        if(Bot.Wizards.has(this.id)) {
            throw new Error('a wizard with the same ID is already registered');
        }
        
        this.stickerNumbers = {
            0: "0️⃣",
            1: "1️⃣",
            2: "2️⃣",
            3: "3️⃣",
            4: "4️⃣",
            5: "5️⃣",
            6: "6️⃣",
            7: "7️⃣",
            8: "8️⃣",
            9: "9️⃣",
            10: "🔟"
        }
        this.getStickerStepNumber = number => {
            if(number <= 10) {
                return this.stickerNumbers[number];
            } else { 
                return number.toString().split('').map(e => this.stickerNumbers[parseInt(e)]).join('')
            }
        }
        this.options = {
            ...{
                localeName: 'wizard',
                began: (context) => {}, 
                completed: (context, data) => {},                
                controls: true, 
                displaySceneNamesOnStepper: null, 
                actionUnknownMessage: 'action_unknown',
                exitMessage: null,
                skipStartMessageAndControls: false,
                timeOutMessage: 'timeout_message',
                pauseHandler: () => {},
                stepNotifications: true,
                finishStickerId: 'CAACAgIAAxkBAAEDy9Vh-5AL-L6ToYP4m-8BQ27NOQ4YzgACTQADWbv8JSiBoG3dG4L3IwQ'
            },
            ...globalOptions,
            ...options
        } 
        /*
        *   Setting up a callback to exit the wizard
        *   - We leave the active scene
        *   - get wizard data
        *   - if the data is empty, then the wizard is interrupted, because the wizard must always return data
        *   - call callback with wizard data
        */
        this.exitCallback = async context => { 
            let options = this.getOptions(context); 
            let t = i18n(context, {
                module: options.localeName
            });
            //await context.scene.leave();
            let data = this.getState(context);
            let isCompleted = Object.keys(data).length;        
            if(isCompleted && options.finishStickerId) {
                await context.replyWithSticker(options.finishStickerId);
            }
            if(!options.exitMessage) {
                await context.replyWithHTML(t('exit_wizard_message', {
                    name: t(this.name),
                    completed: isCompleted,
                }), Markup.removeKeyboard(true));
            } else {
                await context.replyWithHTML(typeof options.exitMessage == 'function' ? options.exitMessage(context, data) : t(options.exitMessage), Markup.removeKeyboard(true));
            }
            this.reset(context);
            return options.completed.call(this, context, data);
        }
        /*
        *   Setting up an entry wizard
        */       
        this.enterCallback = async context => {
            let options = this.getOptions(context); 
            let t = i18n(context, {
                module: options.localeName
            });        
            if(typeof context.session != 'object') {
                context.session = {}
            }
            context.session.stateWizard = new Map;   
            if(context.session.payload) { 
                context.session.stateWizard.set('default', context.session.payload); 
            }
            context.session.lastWizard = this;
            context.session.nextStepNumber = -1;
            context.session.sceneOrder = [];
            if(!options.skipStartMessageAndControls) {
                if(this.options.controls) {       
                    let reply_markup = Markup.keyboard([[Markup.button.text(t('back_control_label')), Markup.button.text(t('exit_control_label'))]]).resize();
                    context.session.keyboardMessage = await context.replyWithHTML(t('enter_wizard_message', {
                        name: t(this.name)
                    }), reply_markup);                
                } else {
                    await context.replyWithHTML(t('enter_wizard_message', {
                        name: t(this.name)
                    }), Markup.removeKeyboard());  
                }
            }
            if(options.stepNotifications) {
                await this.createSteppepMessage(context);
            }
            return options.began.call(this, context);
        }

        if(!Bot.timeOutScene) {
            this.timeOutScene = new BaseScene('wizards-pause-scene');
            this.timeOutScene.on('message', async (context, next) => {
                let options = this.getOptions(context);    
                if(!context.session.lastWizard) {
                    context.scene.leave();
                    return next();
                }  
                if(options.pauseHandler) {
                    let cb = typeof options.pauseHandler == 'function' ? options.pauseHandler.bind(this) : () => {}         
                    return cb('message', context, next);
                }
            });
            this.timeOutScene.action(/.*/, (context) => {
                let options = this.getOptions(context);    
                if(!context.session.lastWizard) {
                    context.scene.leave();
                    return next();
                }       
                if(options.pauseHandler) {
                    let cb = typeof options.pauseHandler == 'function' ? options.pauseHandler.bind(this) : () => {}         
                    return cb('action', context, next);
                }                     
                let t = i18n(context, {
                    module: options.localeName
                })
                let message = t(options.actionUnknownMessage)
                context.answerCbQuery(message).catch(e => {});
            });  

            this.prepareScene(this.timeOutScene);
            Bot.timeOutScene = this.timeOutScene; 
            Bot.Stage.register(this.timeOutScene);
        } else {
            this.timeOutScene = Bot.timeOutScene;
        }

        Bot.Wizards.set(this);
    }
    /*
    *   Add scenes to the wizard and the scenes are added to the bot queue
    */

    wizard.prototype.getSceneId = function(sceneId) {
        return this.id + '-' + sceneId
    }

    wizard.prototype.getScene = function(sceneId) {
        return this.scenes.find(e => e.id == this.getSceneId(sceneId));   
    }

    wizard.prototype.createScene = function(id, options={}) {
        let scene = new BaseScene(this.getSceneId(id));
        scene.display_name = options.display_name || '';
        return scene
    }

    wizard.prototype.prepareScene = function(scene) {
        if(this.options.controls) {
            scene.action('exit', this.confirmExitWizard.bind(this));
            scene.action('back', this.prev.bind(this));
        }
        scene.command('exit', this.exitWizard.bind(this));
        scene.command('back', this.prev.bind(this));
        scene.on('text', async(context, next) => { 
            let options = this.getOptions(context);    
            let message = context.message || context.update.message; 
            let t = i18n(context, {
                module: options.localeName
            });
            if(t(message.text.trim()).toLowerCase() === t('back_control_label').toLowerCase()) {
                return await this.prev(context); 
            }
            if(t(message.text.trim()).toLowerCase() === t('exit_control_label').toLowerCase()) {
                return await this.exitWizard(context);
            }
            return next();
        });
        return scene;
    }
    wizard.prototype._context = function(context) {
        return  {
            toWizard: (wizardId, data) => {
                let wizard = Bot.Wizards.get(wizardId);
                if(!wizard) {
                    return Promise.reject(new Error(wizardId + ' wizard not exist'));
                }
                this.timeOutScene.leave();
                return wizard.begin(context, data);
            },
            next: () => this.next(context),
            nextTo: (sceneId) => this.nextTo(context, sceneId),
            getState: (defaultData={}) => getState(context, defaultData),
            finish: () => this.finish(context),
            leave: () => this.leave(context),
            getCurrentStepNumber: () => this.getCurrentStepNumber(context),
            prev: () => this.prev(context)
        }
    }
    wizard.prototype.addScene = function(options={}, step, next) {
        let sceneId = options.id;
        let scene = this.createScene(sceneId, options);

        if(typeof step != 'function') {
            throw new Error('The callback function is required');
        }
        // Update scene id relative to active wizard
        this.prepareScene(scene);
        this.scenes.push(scene);  
        let inquirerNext = function(context, saveData) {         
            this.saveSceneData(context, saveData); // Saved the step result                        
            if(next && typeof next == 'function') {          
                
                next.call(this._context(context), context);
            } else {
                this.next(context);
            }
        }.bind(this);
        step.call(scene, (context, saveData) => {           
            context.scene.leave().then(() => {
                context.scene.enter(this.timeOutScene.id).then(() => {
                    inquirerNext(context, saveData);
                });
            }); 
        });
        // Stop middleware
        scene.on('message', context => {});
        scene.action(/.*/, (context) => {      
            let globalOptions = this.getOptions(context);                      
            let t = i18n(context, {
                module: options.localeName || globalOptions.localeName
            })
            let message = t(globalOptions.actionUnknownMessage)
            context.answerCbQuery(message).catch(e => {});
        });   
        Bot.Stage.register(scene); 
   }
    /*
    *   Update the message about the current position of the wizard
    */
    wizard.prototype.updateStepperMessage = function(context, text) {
        let chat = context.chat;
        if(context.session.stepMessageID) {
            return Bot.telegram.editMessageText(chat.id, context.session.stepMessageID, false, text, {
                parse_mode: 'html'
            }).catch(e => {})
        }
    }
    wizard.prototype.getCurrentStepNumber = function(context) {
        return (context.session.activeScene ? context.session.sceneOrder.indexOf(context.session.activeScene) : 0) + 1;
    }
    /*
    *   Create a message about the current scene
    */
    wizard.prototype.createSteppepMessage = async function(context) {
        let options = this.getOptions(context);    
        let t = i18n(context, {
            module: options.localeName
        });
        let m = await context.replyWithHTML(t('dialog_status_dialog_started', {
            name: t(this.name)
        }));
        context.session.stepMessageID = m.message_id;
        return context.pinChatMessage(context.session.stepMessageID);
    }
    wizard.prototype.stepController = async function(context, {display_name, replace_stepper_name}) {
        let options = this.getOptions(context);    
        let t = i18n(context, {
            module: options.localeName
        });
        let currentActiveSceneNumber = this.getCurrentStepNumber(context);
        
        let message = (options.displaySceneNamesOnStepper || replace_stepper_name) && display_name ? t(display_name) : t('stepper_message', {
            stepNumber: currentActiveSceneNumber,
            amount: this.scenes.length
        });
    
        message = `${t('dialog_status_label')} ${message}`;
    
        if(context.session.stepMessageID) {   
            return this.updateStepperMessage(context, message);
        }
    }
    /*
    *   Reset wizard
    */
    wizard.prototype.reset = function(context, silence) {        
        delete context.session.activeScene;
        delete context.session.nextStepNumber;
        delete context.session.closeAlertMessage;
        delete context.session.sceneOrder; 
        delete context.session.keyboardMessage; 
        delete context.session.wizardTempOptions;
        let options = this.getOptions(context);    
        if(!silence) {
            let t = i18n(context, {
                module: options.localeName
            });
            let messageID = context.session.stepMessageID;
            if(messageID) {
                context.unpinChatMessage(messageID).then(e => {
                    let dialogMessage = t('wizard_completed_stepper_message', {
                        name: t(this.name)
                    });
                    context.telegram.editMessageText(context.chat.id, messageID, false, `${t('dialog_status_label')} ${dialogMessage}`, {
                        parse_mode: 'html'
                    });
                }).catch(e => {
                    console.log(e);
                });
            } else if(options.stepNotifications) {
                context.unpinAllChatMessages().catch(e => {
                    console.log(e);
                });
            }
        }
        delete context.session.stepMessageID;
        delete context.session.stateWizard; 
        delete context.session.lastWizard;    
        // reset current wizard  
        if(context.scene) { 
            context.scene.leave();
        }
        this.timeOutScene.leave();
    }
    /*  
    *   Get active wizard storage
    */
    wizard.prototype.getState = getState
    /*
    *   Finish and exit the wizard 
    *   the completion wizard callback (exitCallback) will also be called
    */ 
    wizard.prototype.finish = function(context) {
        return this.exitCallback(context);
    }
    /*
    *   Abort and exit
    */
    wizard.prototype.leave = async function(context) {
        delete context.session.stateWizard;  // Удаляем хранилище чтобы вызвать событие незаконченного визарда
        return this.exitCallback(context);
    }
    /*
    *   Exit the wizard
    */
    wizard.prototype.confirmExitWizard = async function(context) {
        await context.answerCbQuery('👍'); 
        await context.telegram.deleteMessage(context.session.closeAlertMessage.chat.id, context.session.closeAlertMessage.message_id);        
        return this.leave(context);
    }
    /*
    *   Request to exit the wizard
    */
    wizard.prototype.exitWizard = async function(context) {
        let options = this.getOptions(context);    
        let t = i18n(context, {
            module: options.localeName
        });
        context.session.closeAlertMessage = await context.replyWithHTML(t('question_about_exiting_the_wizard', {name: t(this.name)}), Markup.inlineKeyboard([Markup.button.callback(t('apply_exit_wizard_btn_label'), 'exit')]));
        return context.session.closeAlertMessage;
    }
    /*
    *   Return to the previous scene
    */
    wizard.prototype.prev = async function(context) {    
        if(context.session.activeScene) {       
            let activeSceneIndex = context.session.sceneOrder.indexOf(context.session.activeScene);
            let prevSceneIndex = activeSceneIndex - 1;        
            if(context.session.sceneOrder[prevSceneIndex]) {
                let prevScene = context.session.sceneOrder[prevSceneIndex];            
                await this._toScene(context, prevScene);
            } else {
                return this.exitWizard(context);
            }
        } else {
            return this.exitWizard(context);
        }
    }
    /*
    *   Internal method to move to the scene
    */
    wizard.prototype._toScene = async function(context, scene) { 
        context.session.activeScene = scene;    
        context.session.stateWizard.delete(context.session.activeScene.id); // Deleting previous scene data
        if(!context.session.sceneOrder.includes(scene)) {
            context.session.sceneOrder.push(scene);
        }   
        let options = this.getOptions(context);    
        let t = i18n(context, {
            module: options.localeName
        });
        try {
            await context.reply(t('step_number', {
                number: this.getStickerStepNumber(context.session.sceneOrder.indexOf(scene) + 1)
            }));
            delete context.session.confirmBox; // Reset all questionnaires of previous scenes
            delete context.session.sendModifiedMessage;
            delete context.session.sendAnswerMessage;
            await context.scene.enter(context.session.activeScene.id);
            if(options.stepNotifications) {
                await this.stepController(context, {
                    display_name: scene.display_name,
                    replace_stepper_name: scene.replace_stepper_name
                });    
            }
        } catch(e) {
            console.log(e);
        }
    }
    wizard.prototype.saveSceneData = function(context, saveData) {
        // Saved the data of the previous scene
        if(context.session.activeScene && saveData != undefined) {
            if(typeof saveData != 'object') {
                saveData = {
                    [context.session.activeScene.id]:saveData
                }
            }
            context.session.stateWizard.set(context.session.activeScene.id, saveData);
        } 
    }
    /*
    *   Jump to a specific scene
    */
    wizard.prototype.nextTo = async function(context, sceneId) { 
        let scene = this.getScene(sceneId);   
        if(!scene) {
            return Promise.reject(`Scene ${sceneId} not exist!`);    
        }
        // No active scene, entry point
        if(!context.session.activeScene) {      
            await this.enterCallback(context);
        } 
        return this._toScene(context, scene);
    }
    /*
    *   Method for moving to the next scene
    */
    wizard.prototype.next = async function(context) {
        // No scenes
        if(!this.scenes.length) {
            return
        }
        // No active scene, entry point
        if(!context.session.activeScene) {      
            await this.enterCallback(context);
        }
    
        let getNextStep  = () => {
            context.session.nextStepNumber += 1; // Updated step
            nextScene = this.scenes[context.session.nextStepNumber];
            if(!nextScene) {
                return // the scenes are over
            }
            /* 
            *   If the next scene is in the scene order, skip it
            *   This happens if the nextTo method was previously used
            */
            if(context.session.sceneOrder.includes(nextScene)) {
                return getNextStep();
            } else {
                return nextScene;
            }
        }
         
        let nextScene;
        let indexOfActiveSceneInOrder = context.session.sceneOrder.indexOf(context.session.activeScene);

        
        /*
         *  The scene is not the last one in the sceneOrder array, so the backStep method was used
         *  move to the next element in sceneOrder (the steps that were ahead) until the order ends, otherwise we return to the last index of the next method
         */
        if(context.session.sceneOrder.length > indexOfActiveSceneInOrder + 1) {
            nextScene = context.session.sceneOrder[indexOfActiveSceneInOrder + 1];
        } else {
            nextScene = getNextStep();
        }
        // No next scene, exit point
        if(!nextScene) {
            await this.exitCallback(context);
            return
        } else {
            await this._toScene(context, nextScene);    
        }   
    }
    
    /*
    *   Wizard launch
    */
   wizard.prototype.getOptions = function(context) {
       let contextOptions = context.session.wizardTempOptions || {}
       return {...this.options, ...contextOptions};
   }
    wizard.prototype.begin = function(context, {sceneId, payload, options}={}) {
        if(!context.scene) {
            return
        }
        this.reset(context); // Reset previous wizards
        if(typeof options == 'object') {
            context.session.wizardTempOptions = options
        }
        if(payload) {
            context.session.payload = payload;
        }
        if(sceneId) {
            return this.nextTo(context, sceneId)
        }
        return this.next(context);
    }

    /*
    *   Wizard initialization
    */
    function init() {
        if(Bot.Wizards) {
            return
        }
        options = Object.assign({ttl: 60 * 180}, globalOptions);
        let storage = new Map();
        Bot.Wizards = {
            storage,
            has: (id) => {
                return storage.has(id);
            },
            get: (id) => {
                return storage.get(id);
            },
            set: (wizard) => {
                return storage.set(wizard.id, wizard);
            }
        }
        Bot.Stage = new Stage([], {
            ttl: options.ttl
        });  
        Bot.use(function(context, next) {
            context.getState = (defaultData) => {
                return getState(context, defaultData);
            }
            return next();
        });      
    }   
    /*
    *   Subscription of all wizards, 
    *   use after you create and include all your wizards
    */
    function subscribe(customSubscribe) {     
        if('function' == typeof customSubscribe) {
            return customSubscribe(Bot, Bot.Stage.middleware());
        }
        return Bot.use(Bot.Stage.middleware());
    }
    function close(options={}) {
        options = Object.assign({
            localeName: 'wizard',
            actionUnknownMessage: 'action_unknown',
            messageUnknownMessage: 'message_unknown',
            timeOutMessage: 'timeout_message',
            removeOldActions: false
        }, globalOptions, options);

        Bot.use((context, next) => {
            if(context.from.is_bot) {
                return next();
            }
            let t = i18n(context, {
                module:options.localeName
            }); 
            // Handling obsolete buttons
            if(context.update && context.update.callback_query) {
                context.answerCbQuery(t(options.actionUnknownMessage)).catch(e => {
                    console.log(e);
                });
                if(options.removeOldActions) {
                    context.deleteMessage().catch(e => {
                        console.log(e);
                    });
                }
            }           
   
           /*
           *    If something has reached here and the wizard is still active, then the wizard session has ended
           *    Deactivate the active wizard
           */
           context.unpinAllChatMessages().catch(e => {
                console.log(e);
           });
           if(context.session.lastWizard) {       
               let message;
               if('function' == typeof options.timeOutMessage) {
                    message = options.timeOutMessage(context, {name: context.session.lastWizard.name});
               } else {
                    message = t(options.timeOutMessage, {name: context.session.lastWizard.name});  
               }
               context.replyWithHTML(message, Markup.removeKeyboard(true)).catch(e => {
                   console.log(e);
               }).finally(() => {
                    context.session.lastWizard.reset(context);
               });
           }
           context.replyWithHTML(t(options.messageUnknownMessage), Markup.removeKeyboard(true));
           return next();
        });
    }
    let i18nPlugin = require('./plugins/i18n');
    let mediaGroup = require('./plugins/mediaGroup');
    let group = require('./plugins/group');

    let {mergeActions, parseAction, createActions, createAction, sendModifiedMessage, replyToModifiedMessage, sendAnswerMessage, replyToAnswerMessage, confirm, confirmed, confirmReset, hasConfirm, removeEmojis} = require('./inc/helpers');

    return {
        wizard,      
        getState,  
        subscribe,
        helpers: {
            parseAction,
            createAction,
            createActions,
            mergeActions,
            sendModifiedMessage,
            replyToModifiedMessage,
            sendAnswerMessage,
            replyToAnswerMessage,
            confirm,
            removeEmojis,
            confirmed,
            confirmReset,
            hasConfirm
        },
        close,
        plugins: {
            i18n: i18nPlugin,
            mediaGroup,
            group
        }
    }  
}

