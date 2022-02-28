const {Composer } = require('telegraf');

module.exports = function(options={}) {
    options = Object.assign({
        timeout: 1000,
        types: ['message'],
        as: 'messages'
    }, options);
    let storage = new Map;
    let id = '_' + Math.random().toString(36).substr(2, 9);
    return Composer.mount(options.types, (ctx, next) => {
        const message = ctx.message || ctx.channelPost
        if (!ctx.from) {
            return next()
        }
        let from = id + ctx.from.id;
        let setResolve = () => {
            return setTimeout(() => {          
                ctx[options.as] = storage.get(from).messages;         
                storage.delete(from);  
                return next();             
            }, options.timeout);
        }
        if (!storage.has(from)) {       
            storage.set(from, {
                messages: []
            });
        } else {
            let {resolve} = storage.get(from);
            clearTimeout(resolve);
        }
        storage.get(from).resolve = setResolve();
        storage.get(from).messages.push(message); 
    });
}