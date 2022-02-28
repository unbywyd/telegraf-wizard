const {Composer } = require('telegraf');

module.exports = function(options={}) {
    options = Object.assign({
        timeout: 200,
        types: ['photo', 'video'],
        as: 'mediaGroup'
    }, options);
    let gallery = new Map;
    return Composer.mount(options.types, (ctx, next) => {
        const message = ctx.message || ctx.channelPost
        if (!message.media_group_id) {
            return next()
        }
        let setResolve = () => {
            return setTimeout(() => {          
                ctx[options.as] = gallery.get(message.media_group_id).messages;         
                gallery.delete(message.media_group_id);  
                return next();             
            }, options.timeout);
        }
        if (!gallery.has(message.media_group_id)) {       
            gallery.set(message.media_group_id, {
                messages: []
            });
        } else {
            let {resolve} = gallery.get(message.media_group_id);
            clearTimeout(resolve);
        }
        gallery.get(message.media_group_id).resolve = setResolve();
        gallery.get(message.media_group_id).messages.push(message);    
    })
}