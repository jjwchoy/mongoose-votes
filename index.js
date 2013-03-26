var ObjectId = require('mongoose').Schema.Types.ObjectId;

function makeRecordVote(votesName, votersName, weight) {
    weight = weight || 1;

    return function(voterId, callback) {
        var q = {_id: this._id};

        // only match if this voter hasn't already voted for this
        q[votersName] = {
            $ne: voterId
        };

        // adds voterId to the voters array
        var push = {};
        push[votersName] = voterId;
        
        // increments the vote count
        var inc = {};
        inc[votesName] = weight;

        var u = {
            $push: push,
            $inc: inc
        };

        this.constructor.update.call(this.constructor, q, u, callback);
    };
};

function makeCancelVote(votesName, votersName, weight) {
    weight = weight || 1;

    return function(voterId, callback) {
        var q = {_id: this._id};

        // only match if this voter has voted for this
        q[votersName] = voterId;

        // removes voterId from the voters array
        var pull = {};
        pull[votersName] = voterId;

        // decrements the vote count
        var inc = {};
        inc[votesName] = -weight;

        var u = {
            $pull: pull,
            $inc: inc
        };

        this.constructor.update.call(this.constructor, q, u, callback);
    };
};

module.exports = exports = function(schema, options) {
    options = options || {};

    var disableDownvotes = !!options.disableDownvotes;

    var tallyName = options.tallyName || 'votes';
    var voterIdType = options.voterIdType || ObjectId;

    var upvotesName = options.upvotesName || 'upvotes';
    var upvotersName = options.upvotersName || 'upvoters';

    var upvoteMethodName = options.upvoteMethodName || 'upvote';
    var cancelUpvoteMethodName = options.cancelUpvoteMethodName || 'cancelUpvote';

    // indexed defaults to false
    var indexed = !!options.indexed;

    var toAdd = {};
    toAdd[upvotesName] = {type: Number, default: 0};
    toAdd[upvotersName] = [voterIdType];

    if (!disableDownvotes) {
        var downvotesName = options.downvotesName || 'downvotes';
        var downvotersName = options.downvotersName || 'downvoters';
        toAdd[downvotesName] = {type: Number, default: 0};
        toAdd[downvotersName] = [voterIdType];
    }

    schema.add(toAdd);

    var upvoteFunc = makeRecordVote(upvotesName, upvotersName);
    var cancelUpvoteFunc = makeCancelVote(upvotesName, upvotersName);

    schema.methods[upvoteMethodName] = upvoteFunc;
    schema.methods[cancelUpvoteMethodName] = cancelUpvoteFunc;

    if (!disableDownvotes) {
        var downvoteMethodName = options.downvoteMethodName || 'downvote';
        var cancelDownvoteMethodName = options.cancelDownvoteMethodName || 'cancelDownvote';

        var downvoteFunc = makeRecordVote(downvotesName, downvotersName);
        var cancelDownvoteFunc = makeCancelVote(downvotesName, downvotersName);

        // Modify upvote function to cancel any downvotes first
        schema.methods[upvoteMethodName] = function(voterId, callback) {
            var self = this;
            cancelDownvoteFunc.call(this, voterId, function(err) {
                if (err) {
                    callback(err, null);
                } else {
                    upvoteFunc.call(self, voterId, callback);
                }
            });
        };

        schema.methods[downvoteMethodName] = function(voterId, callback) {
            var self = this;
            cancelUpvoteFunc.call(this, voterId, function(err) {
                if (err) {
                    callback(err, null);
                } else {
                    downvoteFunc.call(self, voterId, callback);
                }
            });
        };

        schema.methods[cancelDownvoteMethodName] = cancelDownvoteFunc;
    }

    // If the tally name (total count) is different from then upvoters
    // name then we'll add a virtual. If downvoting is enabled, the tally name
    // *must* be different from the upvoters name, otherwise this will not
    // work as intended
    if (tallyName !== upvotersName) {
        schema.virtual(tallyName).get(function() {
            if (disableDownvotes) {
                return this.upvotes;
            } else {
                return this.upvotes - this.downvotes;
            }
        });
    }

    if (indexed) {
        schema.index({'_id': 1, upvotersName: 1});
        if (!disableDownvotes) {
            schema.index({'_id': 1, downvotersName: 1});
        }
    }
};
