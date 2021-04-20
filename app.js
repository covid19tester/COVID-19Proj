const dotenv = require('dotenv'); 
dotenv.config();
//Express Setup
const express       = require('express');
const session       = require('express-session')
const mongoose      = require('mongoose');
const passport      = require('passport');
const localStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const app = express();
const unirest = require("unirest");
const api = unirest("GET", "https://covid-19-data.p.rapidapi.com/country");

const port = process.env.PORT || 3000;



mongoose.connect(process.env.MONGODB_CONNECT, {
    useNewUrlParser: true, 
    useUnifiedTopology: true
});


const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true
    },
 
    puzzle: {
        type: String,
        required: true
    },  
     
    password: {
        type: String,
        required: true}
});

const User = mongoose.model("User", userSchema);


//views
app.set('views' , './views');
app.set('view engine', 'ejs');

//static files, middleware
app.use(express.static('/public'));
app.use('/css', express.static(__dirname + '/public/css'));
app.use('/img', express.static(__dirname + '/public/img'));
app.use(session({
 secret: 'process.env.SESSION_SECRET',
 resave: false,
 saveUninitialized: true
}))
app.use(express.urlencoded({extended: false}));
app.use(express.json());

//passport
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function (user, done) {
    done(null, user.id);
    
});

passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });

});

passport.use(new localStrategy(function (email, password, done) {
    
    User.findOne({ email: email }, function (err, user) {
        
        if (err) return done(err); 
        if (!user) return done(null, false, { message: 'Incorrect Username.' });

        bcrypt.compare(password, user.password, function (err, res) {
            if (err) return done(err);
            if (res === false) return done(null, false, { message: 'Incorrect password.'}); 
        
            return done(null, user);
        });
    });
}));

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
}


function isLoggedOut(req, res, next) {
    if (!req.isAuthenticated()) return next();
    res.redirect('/');
}


//Routes
app.get('/', (req,res) => {
    res.render('login');
});

//login
app.get('/COVIDDATA', isLoggedIn, (req,res) => {
    res.render('statistics')
});

app.get('/login', isLoggedOut, (req,res) => {
    
    const response = {
        title: "Login",
        error: req.query.error
    }

    if (typeof(response.error) != "undefined") {
        res.render('login', {error: true});
    } else {
        res.render('login', {error: false});
    }
});


app.post('/login', passport.authenticate('local',  {
    successRedirect: '/countries',
    failureRedirect: '/login?error=true'
}));

app.get('/logout', function (req,res) {
    req.logout();
    res.redirect('/login');
});


//Create Account Page

app.get('/createacc', isLoggedOut, (req,res) => {
    res.render('createacc')
});

app.post('/createacc', async (req,res) => {     
    
    const Password= req.body.password;
    const username= req.body.username;
    const softPassword= req.body.softPassword;
  
    const exists = await User.exists({ email: username });
                
    if (Password!=softPassword) {
   
        const PasswordFlag = "PasswordError";
        res.render('createacc', {error: PasswordFlag});
        return;
    }

    else if (exists) {

        const EmailFlag ="EmailError";
        res.render('createacc', {error: EmailFlag});
        return;
    } 


    else if (Password==softPassword) {
                
        try {
            
            const hashedPassword = await bcrypt.hash(Password, Number(String(process.env.SALT)));
            const puzzle = await bcrypt.hash(username, Number(String(process.env.SALT)));

            // URL should not read "/" since it changes paths when using link to redirect 
            const purepuzzle = puzzle.replace(/\//g, "slash");

            const person = new User({
    
                email: username,
                puzzle: purepuzzle,
                password: hashedPassword
            });
                
            person.save(function (err) {
                if(err) 
                    return console.error(err);
            });

                res.redirect('/login')
        } catch {
            res.redirect('/createacc')
        }
     
            
    }
   
});


//Forgot Password 
app.get('/forgotpass', isLoggedOut, (req,res) => {
    res.render('forgotpass')
});

app.post('/forgotpass', (req,res) => {    

    const verifyEmail = req.body.verifyEmail;
    const euser = process.env.USER;
    const ecode= process.env.CODE;

    //find email that exists
    User.findOne({email: verifyEmail}, function (err, User) { 
        
        if(User) {
       
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: euser,
                    pass: ecode
                }
            });
            
            const mailOptions = {
                from: euser,
                to: verifyEmail,
                subject: 'Reset Password Coronavirus Statistics',
                html: '<p> Reset password link: <a href=" '+  process.env.RESET_PASSWORD_LINK  + User.puzzle +'">Here</a></p>' 
            };
            
            transporter.sendMail(mailOptions, function(error, info){
                if (error) {
                    console.log(error);
                } else {
                console.log('Email sent: ' + info.response);
                }
            });

            res.redirect('/login');
            
        } else {
            console.log("error email does not exist", err);

        const EmailFlag = "EmailError";
        res.render('forgotpass', {error: EmailFlag});
        return;

        }
        
    });
});



//Create new Password page

app.get('/newpass/:user', (req,res) => {

   const User = {
    userEmail: req.params.user,
    error: false 
    }

res.render('newpass', User);
  
});



app.post('/newpass/:user', async (req,res) => {    
    
    const newPass = req.body.newPass;
    const confirmPass = req.body.password;
    const puzz = req.params.user;
    
    const hashedPassword = await bcrypt.hash(confirmPass, Number(String(process.env.SALT)))
 
    if (newPass == confirmPass) {

        //replace email field with hashedEmail field    
    User.updateOne({ puzzle: puzz}, { password: hashedPassword},
        function (err,docs) {

            if (err){
                console.log("nothing", email)
            }
            else{
    
                res.redirect('/login');
            }
        });
        
    } else {

        console.log("Passwords dont match", newPass, confirmPass);

        const User = {
            userEmail: req.params.user,
            error: true 
        }
        
        res.render('newpass', User);
    }
});



//API Page

app.get('/statistics', isLoggedIn, (req,res) => {
    
  if (res.body == undefined) {
    res.redirect('countries');

    } else {
        res.render('statistics')
    }  
});



//country select page

app.post('/countries', (req, res) => {
  
    api.query({
        "name": req.body.country
        
    });
    
    api.headers({
        "x-rapidapi-key": process.env.RAPID_API_KEY,
        "x-rapidapi-host": process.env.RAPID_API_HOST,
        "useQueryString": true
    });
    
    api.end(function (con) {
        if (con.error) throw new Error(con.error);
    
        const stats= {
            country: con.body[0].country,
            confirmed: con.body[0].confirmed,
            recovered: con.body[0].recovered,
            critical: con.body[0].critical,
            deaths: con.body[0].deaths 
        }         

        res.render('statistics', {name: '', stats});
    });
});



app.get('/countries', isLoggedIn, (req,res) => {
  
    const countries = [
        {name: 'Afghanistan', image: 'img/afghanistan.png', class: 'countryButton'},
        {name: 'Albania', image: 'img/albania.png', class: 'countryButton'},
        {name: 'Algeria', image: 'img/algeria.png', class: 'countryButton'},
        {name: 'Andorra', image: 'img/andorra.png', class: 'countryButton'},
        {name: 'Angola', image: 'img/angola.png', class: 'countryButton'},
        {name: 'Antigua and Barbuda', image: 'img/antigua-and-barbuda.png', class: 'lrgCountryButton'},
        {name: 'Argentina', image: 'img/argentina.png', class: 'countryButton'},
        {name: 'Armenia', image: 'img/armenia.png', class: 'countryButton'},
        {name: 'Aruba', image: 'img/aruba.png', class: 'countryButton'},
        {name: 'Australia', image: 'img/australia.png', class: 'countryButton'},
        {name: 'Austria', image: 'img/austria.png', class: 'countryButton'},
        {name: 'Azerbaijan', image: 'img/azerbaijan.png', class: 'countryButton'},
        {name: 'Bahamas', image: 'img/bahamas.png', class: 'countryButton'},
        {name: 'Bahrain', image: 'img/bahrain.png', class: 'countryButton'},
        {name: 'Bangladesh', image: 'img/bangladesh.png', class: 'countryButton'},
        {name: 'Barbados', image: 'img/barbados.png', class: 'countryButton'},
        {name: 'Belarus', image: 'img/belarus.png', class: 'countryButton'},
        {name: 'Belgium', image: 'img/belgium.png', class: 'countryButton'},
        {name: 'Belize', image: 'img/belize.png', class: 'countryButton'},
        {name: 'Benin', image: 'img/benin.png', class: 'countryButton'},
        {name: 'Bhutan', image: 'img/bhutan.png', class: 'countryButton'},
        {name: 'Bolivia', image: 'img/bolivia.png', class: 'countryButton'},
        {name: 'Bosnia and Herzegovina', image: 'img/bosnia-and-herzegovina.png', class: 'lrgCountryButton'},
        {name: 'Botswana', image: 'img/botswana.png', class: 'countryButton'},
        {name: 'Brazil', image: 'img/brazil.png', class: 'countryButton'},
        {name: 'Brunei', image: 'img/brunei.png', class: 'countryButton'},
        {name: 'Bulgaria', image: 'img/bulgaria.png', class: 'countryButton'},
        {name: 'Burkina Faso', image: 'img/burkina-faso.png', class: 'countryButton'},
        {name: 'Burundi', image: 'img/burundi.png', class: 'countryButton'},
        {name: 'Cabo Verde', image: 'img/cabo-verde.png', class: 'countryButton'},
        {name: 'Cambodia', image: 'img/cambodia.png', class: 'countryButton'},
        {name: 'Cameroon', image: 'img/cameroon.png', class: 'countryButton'},
        {name: 'Canada', image: 'img/canada.png', class: 'countryButton'},
        {name: 'CAR', image: 'img/central-african-republic.png', class: 'countryButton'},
        {name: 'Chad', image: 'img/chad.png', class: 'countryButton'},
        {name: 'Chile', image: 'img/chile.png', class: 'countryButton'},
        {name: 'China', image: 'img/china.png', class: 'countryButton'},
        {name: 'Colombia', image: 'img/colombia.png', class: 'countryButton'},
        {name: 'Comoros', image: 'img/comoros.png', class: 'countryButton'},
        {name: 'Congo', image: 'img/democratic-republic-of-the-congo.png', class: 'countryButton'},
        {name: 'Costa Rica', image: 'img/costa-rica.png', class: 'countryButton'},
        {name: 'Croatia', image: 'img/croatia.png', class: 'countryButton'},
        {name: 'Cuba', image: 'img/cuba.png', class: 'countryButton'},
        {name: 'Cyprus', image: 'img/cyprus.png', class: 'countryButton'},
        {name: 'Czech Republic', image: 'img/czech-republic.png', class: 'countryButton'},
        {name: 'Denmark', image: 'img/denmark.png', class: 'countryButton'},
        {name: 'Djibouti', image: 'img/djibouti.png', class: 'countryButton'},
        {name: 'Dominica', image: 'img/dominica.png', class: 'countryButton'},
        {name: 'Dominican Republic', image: 'img/dominican-republic.png', class: 'lrgCountryButton'},
        {name: 'Ecuador', image: 'img/ecuador.png', class: 'countryButton'},
        {name: 'Egypt', image: 'img/egypt.png', class: 'countryButton'},
        {name: 'El Salvador', image: 'img/el-salvador.png', class: 'countryButton'},
        {name: 'Equatorial Guinea', image: 'img/equatorial-guinea.png', class: 'lrgCountryButton'},
        {name: 'Eritrea', image: 'img/eritrea.png', class: 'countryButton'},
        {name: 'Estonia', image: 'img/estonia.png', class: 'countryButton'},
        {name: 'Eswatini', image: 'img/eswatini.png', class: 'countryButton'},
        {name: 'Ethiopia', image: 'img/ethiopia.png', class: 'countryButton'},
        {name: 'Fiji', image: 'img/fiji.png', class: 'countryButton'},
        {name: 'Finland', image: 'img/finland.png', class: 'countryButton'},
        {name: 'France', image: 'img/france.png', class: 'countryButton'},
        {name: 'Gabon', image: 'img/gabon.png', class: 'countryButton'},
        {name: 'Gambia', image: 'img/gambia.png', class: 'countryButton'},
        {name: 'Georgia', image: 'img/georgia.png', class: 'countryButton'},
        {name: 'Germany', image: 'img/germany.png', class: 'countryButton'},
        {name: 'Ghana', image: 'img/ghana.png', class: 'countryButton'},
        {name: 'Greece', image: 'img/greece.png', class: 'countryButton'},
        {name: 'Greenland', image: 'img/greenland.png', class: 'countryButton'},
        {name: 'Grenada', image: 'img/grenada.png', class: 'countryButton'},
        {name: 'Guatemala', image: 'img/guatemala.png', class: 'countryButton'},
        {name: 'Guinea', image: 'img/guinea.png', class: 'countryButton'},
        {name: 'Guinea-Bissau', image: 'img/guinea-bissau.png', class: 'countryButton'},
        {name: 'Guyana', image: 'img/guyana.png', class: 'countryButton'},
        {name: 'Haiti', image: 'img/haiti.png', class: 'countryButton'},
        {name: 'Honduras', image: 'img/honduras.png', class: 'countryButton'},
        {name: 'Hong Kong', image: 'img/hong-kong.png', class: 'countryButton'},
        {name: 'Hungary', image: 'img/hungary.png', class: 'countryButton'},
        {name: 'Iceland', image: 'img/iceland.png', class: 'countryButton'},
        {name: 'India', image: 'img/india.png', class: 'countryButton'},
        {name: 'Indonesia', image: 'img/indonesia.png', class: 'countryButton'},
        {name: 'Iran', image: 'img/iran.png', class: 'countryButton'},
        {name: 'Iraq', image: 'img/iraq.png', class: 'countryButton'},
        {name: 'Ireland', image: 'img/ireland.png', class: 'countryButton'},
        {name: 'Israel', image: 'img/israel.png', class: 'countryButton'},
        {name: 'Italy', image: 'img/italy.png', class: 'countryButton'},
        {name: 'Ivory Coast', image: 'img/ivory-coast.png', class: 'countryButton'},
        {name: 'Jamaica', image: 'img/jamaica.png', class: 'countryButton'},
        {name: 'Japan', image: 'img/japan.png', class: 'countryButton'},
        {name: 'Jordan', image: 'img/jordan.png', class: 'countryButton'},
        {name: 'Kazakhstan', image: 'img/kazakhstan.png', class: 'countryButton'},
        {name: 'Kenya', image: 'img/kenya.png', class: 'countryButton'},
        {name: 'Kiribati', image: 'img/kiribati.png', class: 'countryButton'},
        {name: 'Kuwait', image: 'img/kuwait.png', class: 'countryButton'},
        {name: 'Kyrgyzstan', image: 'img/kyrgyzstan.png', class: 'countryButton'},
        {name: 'Laos', image: 'img/laos.png', class: 'countryButton'},
        {name: 'Latvia', image: 'img/latvia.png', class: 'countryButton'},
        {name: 'Lebanon', image: 'img/lebanon.png', class: 'countryButton'},
        {name: 'Lesotho', image: 'img/lesotho.png', class: 'countryButton'},
        {name: 'Liberia', image: 'img/liberia.png', class: 'countryButton'},
        {name: 'Libya', image: 'img/libya.png', class: 'countryButton'},
        {name: 'Liechtenstein', image: 'img/liechtenstein.png', class: 'countryButton'},
        {name: 'Lithuania', image: 'img/lithuania.png', class: 'countryButton'},
        {name: 'Luxembourg', image: 'img/luxembourg.png', class: 'countryButton'},
        {name: 'Madagascar', image: 'img/madagascar.png', class: 'countryButton'},
        {name: 'Malawi', image: 'img/malawi.png', class: 'countryButton'},
        {name: 'Malaysia', image: 'img/malaysia.png', class: 'countryButton'},
        {name: 'Maldives', image: 'img/maldives.png', class: 'countryButton'},
        {name: 'Mali', image: 'img/mali.png', class: 'countryButton'},
        {name: 'Malta', image: 'img/malta.png', class: 'countryButton'},
        {name: 'Marshall Islands', image: 'img/marshall-islands.png', class: 'countryButton'},
        {name: 'Mauritania', image: 'img/mauritania.png', class: 'countryButton'},
        {name: 'Mauritius', image: 'img/mauritius.png', class: 'countryButton'},
        {name: 'Mexico', image: 'img/mexico.png', class: 'countryButton'},
        {name: 'Micronesia', image: 'img/micronesia.png', class: 'countryButton'},
        {name: 'Moldova', image: 'img/moldova.png', class: 'countryButton'},
        {name: 'Monaco', image: 'img/monaco.png', class: 'countryButton'},
        {name: 'Mongolia', image: 'img/mongolia.png', class: 'countryButton'},
        {name: 'Montenegro', image: 'img/montenegro.png', class: 'countryButton'},
        {name: 'Morocco', image: 'img/morocco.png', class: 'countryButton'},
        {name: 'Mozambique', image: 'img/mozambique.png', class: 'countryButton'},
        {name: 'Myanmar', image: 'img/myanmar.png', class: 'countryButton'},
        {name: 'Namibia', image: 'img/namibia.png', class: 'countryButton'},
        {name: 'Nauru', image: 'img/nauru.png', class: 'countryButton'},
        {name: 'Nepal', image: 'img/nepal.png', class: 'countryButton'},
        {name: 'Netherlands', image: 'img/netherlands.png', class: 'countryButton'},
        {name: 'New Zealand', image: 'img/new-zealand.png', class: 'countryButton'},
        {name: 'Nicaragua', image: 'img/nicaragua.png', class: 'countryButton'},
        {name: 'Niger', image: 'img/niger.png', class: 'countryButton'},
        {name: 'Nigeria', image: 'img/nigeria.png', class: 'countryButton'},
        {name: 'North Korea', image: 'img/north-korea.png', class: 'countryButton'},
        {name: 'North Macedonia', image: 'img/north-macedonia.png', class: 'lrgCountryButton'},
        {name: 'Norway', image: 'img/norway.png', class: 'countryButton'},
        {name: 'Oman', image: 'img/oman.png', class: 'countryButton'},
        {name: 'Pakistan', image: 'img/pakistan.png', class: 'countryButton'},
        {name: 'Palau', image: 'img/palau.png', class: 'countryButton'},
        {name: 'Palestine', image: 'img/palestine.png', class: 'countryButton'},
        {name: 'Panama', image: 'img/panama.png', class: 'countryButton'},
        {name: 'Papua New Guinea', image: 'img/papua-new-guinea.png', class: 'lrgCountryButton'},
        {name: 'Paraguay', image: 'img/paraguay.png', class: 'countryButton'},
        {name: 'Peru', image: 'img/peru.png', class: 'countryButton'},
        {name: 'Philippines', image: 'img/philippines.png', class: 'countryButton'},
        {name: 'Poland', image: 'img/poland.png', class: 'countryButton'},
        {name: 'Portugal', image: 'img/portugal.png', class: 'countryButton'},
        {name: 'Puerto Rico', image: 'img/puerto-rico.png', class: 'countryButton'},
        {name: 'Qatar', image: 'img/qatar.png', class: 'countryButton'},
        {name: 'Republic of the Congo', image: 'img/republic-of-the-congo.png', class: 'lrgCountryButton'},
        {name: 'Romania', image: 'img/romania.png', class: 'countryButton'},
        {name: 'Russia', image: 'img/russia.png', class: 'countryButton'},
        {name: 'Rwanda', image: 'img/rwanda.png', class: 'countryButton'},
        {name: 'Saint Kitts and Nevis', image: 'img/saint-kitts-and-nevis.png', class: 'lrgCountryButton'},
        {name: 'Saint Lucia', image: 'img/saint-lucia.png', class: 'countryButton'},
        {name: 'Saint Vincent and the Grenadines', image: 'img/saint-vincent-and-the-grenadines.png', class: 'svCountryButton'},
        {name: 'Samoa', image: 'img/samoa.png', class: 'countryButton'},
        {name: 'San Marino', image: 'img/san-marino.png', class: 'countryButton'},
        {name: 'Sao Tome and Principe', image: 'img/sao-tome-and-principe.png', class: 'lrgCountryButton'},
        {name: 'Saudi Arabia', image: 'img/saudi-arabia.png', class: 'countryButton'},
        {name: 'Senegal', image: 'img/senegal.png', class: 'countryButton'},
        {name: 'Serbia', image: 'img/serbia.png', class: 'countryButton'},
        {name: 'Seychelles', image: 'img/seychelles.png', class: 'countryButton'},
        {name: 'Sierra Leone', image: 'img/sierra-leone.png', class: 'countryButton'},
        {name: 'Singapore', image: 'img/singapore.png', class: 'countryButton'},
        {name: 'Slovakia', image: 'img/slovakia.png', class: 'countryButton'},
        {name: 'Slovenia', image: 'img/slovenia.png', class: 'countryButton'},
        {name: 'Solomon Islands', image: 'img/solomon-islands.png', class: 'countryButton'},
        {name: 'Somalia', image: 'img/somalia.png', class: 'countryButton'},
        {name: 'South Africa', image: 'img/south-africa.png', class: 'countryButton'},
        {name: 'South Korea', image: 'img/south-korea.png', class: 'countryButton'},
        {name: 'South Sudan', image: 'img/south-sudan.png', class: 'countryButton'},
        {name: 'Spain', image: 'img/spain.png', class: 'countryButton'},
        {name: 'Sri Lanka', image: 'img/sri-lanka.png', class: 'countryButton'},
        {name: 'Sudan', image: 'img/sudan.png', class: 'countryButton'},
        {name: 'Suriname', image: 'img/suriname.png', class: 'countryButton'},
        {name: 'Sweden', image: 'img/sweden.png', class: 'countryButton'},
        {name: 'Switzerland', image: 'img/switzerland.png', class: 'countryButton'},
        {name: 'Syria', image: 'img/syria.png', class: 'countryButton'},
        {name: 'Taiwan', image: 'img/taiwan.png', class: 'countryButton'},
        {name: 'Tajikistan', image: 'img/tajikistan.png', class: 'countryButton'},
        {name: 'Tanzania', image: 'img/tanzania.png', class: 'countryButton'},
        {name: 'Thailand', image: 'img/thailand.png', class: 'countryButton'},
        {name: 'Timor-Leste', image: 'img/timor-leste.png', class: 'countryButton'},
        {name: 'Togo', image: 'img/togo.png', class: 'countryButton'},
        {name: 'Tonga', image: 'img/tonga.png', class: 'countryButton'},
        {name: 'Trinidad and Tobago', image: 'img/trinidad-and-tobago.png', class: 'lrgCountryButton'},
        {name: 'Tunisia', image: 'img/tunisia.png', class: 'countryButton'},
        {name: 'Turkey', image: 'img/turkey.png', class: 'countryButton'},
        {name: 'Turkmenistan', image: 'img/turkmenistan.png', class: 'countryButton'},
        {name: 'Tuvalu', image: 'img/tuvalu.png', class: 'countryButton'},
        {name: 'Uganda', image: 'img/uganda.png', class: 'countryButton'},
        {name: 'Ukraine', image: 'img/ukraine.png', class: 'countryButton'},
        {name: 'UAE', image: 'img/united-arab-emirates.png', class: 'countryButton'},
        {name: 'UK', image: 'img/united-kingdom.png', class: 'countryButton'},
        {name: 'USA', image: 'img/united-states-of-america.png', class: 'countryButton'},
        {name: 'Uruguay', image: 'img/uruguay.png', class: 'countryButton'},
        {name: 'Uzbekistan', image: 'img/uzbekistan.png', class: 'countryButton'},
        {name: 'Vanuatu', image: 'img/vanuatu.png', class: 'countryButton'},
        {name: 'Vatican City', image: 'img/flag-of-vatican-city.png', class: 'countryButton'},
        {name: 'Venezuela', image: 'img/venezuela.png', class: 'countryButton'},
        {name: 'Vietnam', image: 'img/vietnam.png', class: 'countryButton'},
        {name: 'Yemen', image: 'img/yemen.png', class: 'countryButton'},
        {name: 'Zambia', image: 'img/zambia.png', class: 'countryButton'},
        {name: 'Zimbabwe', image: 'img/zimbabwe.png', class: 'countryButton'},
    ]
    res.render('countries',{name: '', countries});

});

//Listen on port 3000
app.listen(port, () => console.info('Listening on port 3000'))

