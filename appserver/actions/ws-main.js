'use strict';
const THIS_MODULE_NAME = 'ws-main';
const THIS_MODULE_TITLE = 'Send and receive Websocket data related to this applications core features';
const THIS_CODE_NAME = 'PhoneStreamer'

var isSetup = false;
var wssMain = false;
var wsRoom;
var clients = {};
var users = {};

module.exports.setup = function setup(scope,options) {
    var config = scope;
    var $ = config.locals.$;

    function Route() {
        this.name = THIS_MODULE_NAME;
        this.title = THIS_MODULE_TITLE;
    }

    //--- Get the data we want to sent to the clients
    function getPeopleSummary(){
        var tmpList = {};
        for( var aID in users ){
            var tmpPerson = users[aID] || {};
            if( tmpPerson.socketid ){
                var tmpName = (tmpPerson.profile && tmpPerson.profile.name) || 'Host';
                var tmpUserID = tmpPerson.userid || 'Host';
                tmpList[aID] = {name:tmpName, userid: tmpUserID};
            }
        }
        return tmpList;
    }    

    function resendPeople(){
        wsRoom.sendDataToAll({action:'people', people: getPeopleSummary()});
    }

    //--- Send a request to connect to the target client on behalf of the source client
    function sendConnectRequest(theWS, theData){
        var tmpName = '';
        var tmpUserID = theWS.userid;
        if( users[tmpUserID] ){
            tmpName = users[tmpUserID].profile.name
        }
        if( users[theData.to] ){
            var tmpUser = users[theData.to];
            var tmpSocketID = tmpUser.socketid;
            wsRoom.sendDataToClient(tmpSocketID, {action:'meetingrequest', offer: theData.offer, fromid: theWS.userid, fromname: tmpName, message: 'Meeting request from ' + tmpName})
        } else {
            wsRoom.sendDataToClient(theWS.id, {action:'meetingreply', fromid: theWS.userid, status: false, message: 'No longer available'})  
        }
    }
    
    //--- Send a connection response to the original source client on behalf of the target client
    function sendConnectResponse(theWS, theData){
        var tmpMsg = theData.message || {};
        
        var tmpName = '';
        //--- User ID of person making the reply
        var tmpUserID = theWS.userid;
        if( users[tmpUserID] ){
            tmpName = users[tmpUserID].profile.name
        }

        if( users[tmpMsg.from] ){
            var tmpUser = users[tmpMsg.from];
            var tmpSocketID = tmpUser.socketid;
            wsRoom.sendDataToClient(tmpSocketID, {action:'meetingresponse', answer: theData.answer, fromid: tmpUserID, fromname: tmpName, message: tmpMsg})
        } else {
            console.log('unknown user',tmpMsg)
        }
    }
    
    //--- When a client creates or updates the user information, a new profile is sent back to the server
    //     we refresh the details and send new people list to clients
    function updateProfile(theWS, theData){
        var tmpSocketID = theWS.id;
        var tmpUserID = theData.userid;
        var tmpProfile = theData.profile;
        theWS.userid = tmpUserID;

        users[tmpUserID] = {
            socketid: tmpSocketID,
            userid: tmpUserID,
            profile: tmpProfile
        }

        clients[tmpSocketID] = clients[tmpSocketID] || {};
        clients[tmpSocketID].profile = tmpProfile;
        clients[tmpSocketID].userid = tmpUserID;
        resendPeople();
    }
    
    //--- When a new client connects, create a new unique ID and send a welcome message along with current people list
    function onConnect(ws){
        ws.userid = $.ws.mgr.getUniqueID();        
        ws.send(JSON.stringify({action: 'welcome', userid: ws.userid, id: ws.id, people:getPeopleSummary()}))
    }

    //--- When a socket is removed, clear the user and resend the people list to clients
    function onMessage(ws,data,isBinary){
        var tmpData = (''+data).trim();
        if( tmpData.startsWith('{')){
            tmpData = JSON.parse(tmpData);
        }
        if( tmpData.action ){
            if( tmpData.action == 'profile' && tmpData.profile){
                updateProfile(ws,tmpData);
            } else if( tmpData.action == 'meeting'){
                sendConnectRequest(ws,tmpData);
            } else if( tmpData.action == 'meetingresponse'){
                sendConnectResponse(ws,tmpData);
                
            } else {
                console.log('unknown action',tmpData.action);
            }
        }
    }

    //--- The client responds to the welcome message that handles the initial adding of a person / client
    function onSocketAdd(theID){
        //--- placeholder
    }

    //--- When a socket is removed, clear the user and resend the people list to clients
    function onSocketRemove(theID){
        if( clients[theID] ){
            var tmpUserID = clients[theID].userid || '';
            var tmpUser = users[tmpUserID];
            if( tmpUser && tmpUser.socketid ){
                //--- Clear socket it to show not active, but keep user with ID here
                //     ToDo: cleanup to remove inactive after x period?
                tmpUser.socketid = '';
            }
            delete clients[theID];
            resendPeople();
        }
    }

    
/**
 * Main Entrypoint
 * 
 * This creates a new node.js library WebSocketServer
 *  - noServer:true is used because we are fulfilling the websocket with an existing server enpoint
 *     ... instead of creating a new WebSocket server.
 *     ... (When using https, websockets must be wss, which is automatic in the client code)
 *  
 * This also creates a new WebSocketRoom, which is a simple control that tracks who comes and goes 
 *   and tell you about it. Also sends along messages to handle and a message when it connects
 * 
 * Note: A quick link to that code can be found in the readme of this repo.
 * 
 */
    if( options && options.websocket === true ){

        if( !isSetup ){
            wssMain = new $.ws.WebSocketServer({ noServer: true });
            wsRoom = new $.ws.WebSocketRoom({name:THIS_CODE_NAME, server: wssMain, onConnect: onConnect, onMessage: onMessage, onSocketAdd: onSocketAdd, onSocketRemove: onSocketRemove, pingInterval:0 });

            isSetup = true;
            console.log(THIS_CODE_NAME + ' created new websocket room')
        }
        
        return wssMain;
    }

     //--- When called by the Winsock protocol, the below code does not run
    //--- When called as a normal endpoint, the winsock code DOES NOT run but instead the below code runs
    var base = Route.prototype;
    //==== End of common setup - add special stuff below
    //--- must have a "run" method *** 

    //--- Load the prototype
    base.run = function (req, res, next) {
        var self = this;
        return new Promise( async function (resolve, reject) {
            try {
                var tmpRet = {
                    status: true,
                    people: getPeopleSummary()
                }
                resolve(tmpRet);
            }
            catch (error) {
                console.log('Err : ' + error);
                reject(error);
            }

        });

    }



    //====== IMPORTANT --- --- --- --- --- --- --- --- --- --- 
    //====== End of Module / setup ==== Nothing new below this
    return async function processReq(req, res, next) {
        try {
            var tmpRoute = new Route();
            var tmpResults = await (tmpRoute.run(req, res, next));
            res.json({
                status: true,
                results: tmpResults
            })
        } catch (ex) {
            res.json({ status: false, error: ex.toString() })
        }
    }
};
