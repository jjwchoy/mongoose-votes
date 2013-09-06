var vows = require('vows');
var assert = require('assert');
var Q = require('q');

var mongoose = require('mongoose');
var votesPlugin = require('./');

var ObjectID = mongoose.mongo.ObjectID;

// Set up a simple schema for testing
var linkSchema = mongoose.Schema({
    link: String
});

linkSchema.plugin(votesPlugin);

var Link = mongoose.model('Link', linkSchema);

// set up some voters
var v1 = ObjectID();
var v2 = ObjectID();
var v3 = ObjectID();
var v4 = ObjectID();

mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/votes');

vows.describe('Votes').addBatch({
    'simple voting': {
        topic: function() {
            var callback = this.callback;
            Q.nfcall(Link.create, {link:'http://www.google.com'})
                .then(function(link) {
                    function doUpvote(voterId) {
                        return Q.nfcall(link.upvote, voterId);
                    }
                    return Q.all([
                        doUpvote(v1),
                        doUpvote(v2),
                        doUpvote(v3)
                    ]);
                })
               .nodeify(callback);
        },
        'simple upvotes': {
            topic: function(link) {
                link.upvote(v1, this.callback);
            },
            'results': function(n) {
                assert.equal(1, n[0]);
                assert.equal(1, n[1]);
                assert.equal(1, n[2]);
            }
        }
    }
}).export(module);
