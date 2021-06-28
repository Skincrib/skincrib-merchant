const Skincrib = require('./index.js');

const market = new Skincrib({
    key: '', //skincrib merchant api key
    reconnect: true, //auto-reconnect to websocket if disconnected
    memory: true //store listings and active client deposits/withdraws in memory
});

market.on('authenticated', (message)=>{
    console.log(message);
});
market.on('disconnect', (message)=>{ //disconnected from socket
    console.log(message);
});
market.on('error', (error)=>{
    console.error(error);
});

market.on('listing.added', (listing)=>{ //new listing on market, send to clients when this is recieved
    console.log('Listing Added:', listing);
});
market.on('listing.removed', (listing)=>{ //listing removed from market
    console.log('Listing Removed:', listing);
});
market.on('listing.updated', (listing)=>{ //one of your client's active listings has had a status update
    console.log('Listing Updated:', listing);
});

market.authenticate()
.then((success)=>{
    console.log(success); //successfully authenticated

    market.getAllListingsFromServer() //fetch all active listings on market so you are up-to-date.
    .then((listings)=>{
        console.log(listings);
    }, (error)=>{
        console.log(error);
    });

}, (err)=>{
    console.error(err); //error authenticating
});

