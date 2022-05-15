const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
const port = process.env.PORT || 5000;
require('dotenv').config();

// middleware
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.crxfa.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run(){
    try{
        await client.connect();
        const serviceCollection = client.db("doctors_portal").collection("services");
        const bookingInfoCollection = client.db("doctors_portal").collection("booking-info");
        const userCollection = client.db("doctors_portal").collection("user");

        app.put('/user/:email', async(req, res)=>{
            const email = req.params.email;
            const user = req.body;
            const filter = {email: email};
            const options = {upsert: true};
            const updatedDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            res.send({result, token});
        })

        app.get('/bookingInfo', async(req, res)=>{
            const patient = req.query.email;
            const query = {patient: patient};
            const bookings = await bookingInfoCollection.find(query).toArray();
            res.send(bookings)
        })

        app.post('/bookingInfo', async(req, res)=>{
            const bookingInfo = req.body;
            const query = {treatment: bookingInfo.treatment, date: bookingInfo.date, patient: bookingInfo.patient}; 
            const exists = await bookingInfoCollection.findOne(query);
            if(exists){
                return res.send({success: false, bookingInfo: exists})
            } 
            const result = await bookingInfoCollection.insertOne(bookingInfo);
            res.send({success: true, result})
        })

        app.get('/services', async(req, res)=>{
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services)
        })

        app.get('/available', async(req, res)=>{
            const date = req.query.date;
            // step 1: get all services
            const services = await serviceCollection.find().toArray();
            
            // step 2: get the booking of that day. output [{}, {}, {}, {}, {}, {}]
            const query = {date: date};
            const bookings = await bookingInfoCollection.find(query).toArray();

            // step 3: for each  service 
            services.forEach(service => {
                // step 4: find booking for that service. output [{}, {}, {}]
                const serviceBookings = bookings.filter( book => book.treatment === service.name);
                // step 5: select slots for the service bookings. output ['', '', '']
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                // step 7: set available to slots to make it easier
                service.slots = available;
            })
            res.send(services);
        })

        /*
        * API naming convention
        * app.get('/booking) // get all booking in this collection. or get more than one or by filter
        * app.get('/booking/:id) //get a specific booking
        * app.post('/booking) // add a new booking
        * app.patch('/booking/:id')
        * app.delete('/booking/:id')
        */ 
    }
    finally{

    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello Doctor Uncle')
  })
  
  app.listen(port, () => {
    console.log(`Doctor app listening on port ${port}`)
  })
