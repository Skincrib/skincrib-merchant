const io = require('socket.io-client');
const assert = require('assert');
const EventEmitter = require('events').EventEmitter;

const SKINCRIB_URL = 'https://skincrib.com/merchants';

const socket = io(SKINCRIB_URL, {
    transports: ['websocket'],
    upgrade: false
});

module.exports = class SkincribMerchant extends EventEmitter{
    constructor({ key, reconnect, memory } = {key: null, reconnect: true, memory: true}){
        super();
        assert(key, '"key" parameter must be included to connect to Skincrib.');
        assert(typeof reconnect == 'boolean', '"reconnect" parameter must be a boolean.');
        assert(typeof memory == 'boolean', '"memory" parameter must be a boolean.');
        this.connected();

        this.key = key; //api key
        this.reconnect = reconnect;
        this.memory = memory;
        this.authenticated = false;

        this.listings = [];
        this.market = {
            value: 0,
            max: 0
        }

        this.clients = {
            deposits: {},
            withdraws: {}
            /*deposits: {
                'steamid': []
            },
            withdraws: {
                'steamid': []
            }*/
        }

        socket.on('connect', ()=>this.connected);
        socket.on('disconnect', ()=>this.disconnected);
        socket.on('error', ()=>this.error);

        socket.on('p2p:listings:new', (listing)=>this.listingAdded(listing));
        socket.on('p2p:listings:removed', ({assetid})=>this.listingRemoved(assetid));
        socket.on('p2p:listings:status', (listing)=>this.listingStatus(listing));
    }

    get marketValue(){
        return this.market.value / 100;
    }
    get marketMax(){
        return this.market.max / 100;
    }
    get getAllListingsFromMemory(){
        return this.listings;
    }
    getClientDeposits(steamid){
        return this.clients.deposits[steamid];
    }
    getClientWithdraws(steamid){
        return this.clients.withdraws[steamid];
    }

    connected(){
        return this.emit('connected', 'Connected to Skincrib websocket server.');
    }
    disconnected(){
        this.authenticated = false;
        if(this.reconnect) this.authenticate();
        return this.emit('disconnected', 'Disconnected from Skincrib websocket server.');
    }
    error(error){
        if(error.message) return this.emit('error', error.message);
        this.emit('error', error);
    }

    listingAdded(listing){
        if(this.memory){
            if(listing.price > this.market.max){
                this.market.max = listing.price;
            }
            this.listings.push(listing);
        }
        
        this.emit('listing.added', listing);
    }
    listingRemoved(assetid){
        if(this.memory){
            let listing = this.listings.find(x => x.assetid == assetid);
            let index = this.listings.findIndex(x => x.assetid == assetid);

            if(index == -1) return;
            if(listing.price == this.market.max){
                this.market.max = Math.max.apply(Math, this.listings.map(x=> x.price ))
            }
            this.listings.splice(index, 1);
            this.market.value -= listing.price;

            return this.emit('listing.removed', listing);
        }

        this.emit('listing.removed', assetid);
    }
    findListing(type, assetid){
        for(const steamid of Object.keys(this.clients[type])){
            let listing = this.clients[type][steamid].find(x => x.assetid == assetid);
            if(listing){
                return [steamid, listing, this.clients[type][steamid].findIndex(x => x.assetid == assetid)];
            }
        }
        return [false, false, false];
    }
    listingStatus(listing){
        if(this.memory){
            let [steamid, newListing, index] = this.findListing(listing.type, listing.assetid);
                
            this.clients[listing.type][steamid][index] = newListing;
            this.emit('listing.updated', {...listing, steamid});
        } else{
            this.emit('listing.updated', listing);
        }
    }

    //authenticate to api
    authenticate(){
        return new Promise((res, rej)=>{
            socket.emit('authenticate', {key: this.key}, (err, data)=>{
                if(err){
                    return rej(err.message);
                }
                this.authenticated = true;
                this.emit('authenticated', 'Connected to merchant socket.');
                return res(data.data);
            });
        });
    }
    //load client csgo inventory
    loadInventory(steamid){
        return new Promise((res, rej)=>{
            assert(steamid);
            assert(this.authenticated, 'You must authenticate to the websocket first.');

            socket.emit('user:loadInventory', {steamid}, (err, data)=>{
                if(err){
                    return rej(err.message);
                }
                return res(data.data.inventory);
            });
        });
    }
    //fetch all active listings on the market
    getAllListingsFromServer(){
        return new Promise((res, rej)=>{
            assert(this.authenticated, 'You must authenticate to the websocket first.');

            socket.emit('p2p:listings:get', {}, (err, data)=>{
                if(err){
                    return rej(err.message);
                }
                
                if(this.memory) this.listings = data.data;

                return res(data.data);
            });
        });
    }
    //create new listing on market
    createListings(options){
        return new Promise((res, rej)=>{
            const {steamid, apiKey, tradeUrl, items} = options;
            assert(this.authenticated, 'You must authenticate to the websocket first.');
            assert(steamid, 'Provide a client\'s SteamID64.');
            assert(apiKey, 'Provide a client\'s Steam api-key.');
            assert(tradeUrl, 'Provide a client\'s Steam tradeurl.');
            assert((typeof items == Array && items.length > 0), 'Provide an array of at least one item object to list.');
            items.forEach((x, i) => assert((x.assetid && x.price && x.percentIncrease), `Item object index ${i} should contain a minimum of: assetid, price, percentIncrease.`));

            socket.emit('p2p:listings:new', {steamid, apiKey, tradeUrl, items}, (err, data)=>{
                if(err.message){
                    return rej(err.message);
                }
                if(this.memory){
                    if(!this.clients.deposits[steamid]){
                        this.clients.deposits[steamid] = [];
                    }
                    this.clients.deposits[steamid].concat(data.data);
                }

                return res(err, data.data);
            });
        });
    }
    //cancel listing on market
    cancelListings(options){
        return new Promise((res, rej)=>{
            const {steamid, assetids} = options;
            assert(this.authenticated, 'You must authenticate to the websocket first.');
            assert(steamid, 'Provide a client\'s SteamID64.');
            assert((typeof assetids == Array && assetids.length > 0), 'Provide an array of at least one assetid to cancel.');

            socket.emit('p2p:listings:cancel', {steamid, assetids}, (err, data)=>{
                if(err.message){
                    return rej(err.message);
                }
                if(this.memory){
                    if(this.clients.deposits[steamid]){
                        for(const assetid of Object.keys(data.data)){
                            let index = this.clients.deposits[steamid].findIndex(x => x.assetid == assetid);
                            if(index == -1) continue;

                            this.clients.deposits[steamid].splice(index, 1);
                        }
                    }
                }

                return res(err, data.data);
            });
        });
    }
    //purchase listing on market
    purchaseListing(options){
        return new Promise((res, rej)=>{
            const {steamid, assetid} = options;
            assert(this.authenticated, 'You must authenticate to the websocket first.');
            assert(steamid, 'Provide a client\'s SteamID64.');
            assert(assetid, 'Provide the Asset ID of the listing you want to purchase.');

            socket.emit('p2p:listings:purchase', {steamid, item: {assetid}}, (err, data)=>{
                if(err){
                    return rej(err.message);
                }

                if(this.memory){
                    if(!this.clients.withdraws[steamid]){
                        this.clients.withdraws[steamid] = [];
                    }
                    this.clients.withdraws[steamid].push(data.data);
                }
                return res(data.data);
            });
        });
    }
    //confirm seller is ready to sell item
    confirmListing(options){
        return new Promise((res, rej)=>{
            const {steamid, assetid} = options;
            assert(this.authenticated, 'You must authenticate to the websocket first.');
            assert(steamid, 'Provide a client\'s SteamID64.');
            assert(assetid, 'Provide the Asset ID of the listing you want to confirm.');

            socket.emit('p2p:listings:confirm', {steamid, assetid}, (err, data)=>{
                if(err){
                    return rej(err.message);
                }
                return res(data.message);
            });
        });
    }
}