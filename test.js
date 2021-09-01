const Skincrib = require('./index.js');

let buyer = {
    steamId: "76561198314565574",
    apiKey: "BA773D131B36935FCF99BD287F3743EB",
    tradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=354299846&token=-jfYEB7D",
};
let seller = {
    steamId: "76561198317890476",
    apiKey: "9396D8B00854FFA134E22883919DEA93",
    tradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=357624748&token=TD_35VpT",
};

const market = new Skincrib({
    key: '76561198392185014-279516a0-16e1-4f8e-b0b5-02e4e4c9db8b', //skincrib merchant api key
    reconnect: true, //auto-reconnect to websocket if disconnected
    memory: true //store listings and active client deposits/withdraws in memory
});

let bought = false;

market.on('authenticated', (message)=>{
    console.log(message);
});
market.on('disconnect', (message)=>{ //disconnected from socket
    console.log(message);
});
market.on('error', (error)=>{
    console.error(error);
});

market.on('listing.added', async (listing)=>{ //new listing on market, send to clients when this is recieved
    if(!bought){
        bought = true;
        console.log('Listing Added:', listing);
        let purchaseData = await market.purchaseListing({steamid: buyer.steamId, tradeUrl: buyer.tradeUrl, id: listing.id});
        console.log('Purchase Data:', purchaseData);
    }
});
market.on('listing.removed', (listing)=>{ //listing removed from market
    console.log('Listing Removed:', listing);
});
market.on('listing.updated', async (listing)=>{ //one of your client's active listings has had a status update
    console.log('Listing Updated:', listing);
    if(listing.status == 'sell_confirmation'){
        let confirmData = await market.confirmListing({steamid: seller.steamId, id: listing.id});
        console.log('Confirm Data:', confirmData);
    }
});

market.authenticate()
.then(async (success)=>{
    return console.log(success); //successfully authenticated

    let activeListings = await market.getClientActiveListings(seller.steamId);
    console.log(activeListings);
    if(activeListings.deposits.length > 0){
        let [cancelErr, cancelData] = await market.cancelListings({steamid: seller.steamId, ids: activeListings.deposits.map(x => x.id)});
        console.log([cancelErr, cancelData]);
    } 

    let inventory = await market.loadInventory(seller.steamId);
    let toList = inventory.map(x => {
        if(x.accepted){
            return {
                ...x,
                percentIncrease: 0
            }
        }
    }).filter(x => x);
    console.log('Inventory:', toList.length);

    let [err, data] = await market.createListings({steamid: seller.steamId, apiKey: seller.apiKey, tradeUrl: seller.tradeUrl, items: toList});
    console.log([err, data]);

}, (err)=>{
    console.error(err); //error authenticating
});

